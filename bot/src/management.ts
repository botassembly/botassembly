// `bot assembly` — the writing lens on the home (management.md). Inspection
// reads the home; this is the only place that changes what it holds, and the
// only place in the runtime that runs git. Every answer is read off the disk:
// there is no index, so there is nothing to drift.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readlinkSync, type Dirent } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { lock } from "proper-lockfile";
import { assemblyMarker, lstatExists } from "./documents.ts";
import { heldAssemblies, liveAssemblies, lockRun, type Held } from "./inspection.ts";
import { NOT_ONE, scratchHome, scratchRoot } from "./invocation.ts";
import { OWNER_ONLY, errorCode, visible } from "./model.ts";
import { runProcess, type DriverClock } from "./process.ts";
import type { ExitCode, Refusal, RefusalCode } from "./spine.ts";

// A clone is network-bound work a person is waiting on: long enough for a real
// repository, short enough that a hung transport ends rather than hangs.
const FETCH_TIMEOUT = 600_000;
const ASSEMBLY_MUTATION_LOCK = { realpath: false, stale: 10_000, retries: 0 } as const;

export interface ManageInput {
  home: string;
  verb: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  clock: DriverClock;
  afterAssemblyUpdateAside?: () => Promise<void>;
  afterAssemblyUpdateSelection?: () => Promise<void>;
  afterAssemblyUpdatePublish?: () => Promise<void>;
  validateAssemblyUpdateSelection?: (selection: AssemblyUpdateSelection) => void;
}

export interface ManagementResult {
  exitCode: ExitCode;
  lines: string[];
  faults?: Refusal[];
  creation?: AssemblyCreation;
  updates?: AssemblyUpdateOutcome[];
  updateTrouble?: { name: string; reason: string };
  removal?: AssemblyRemoval;
}

export interface AssemblyCreation { name: string; kind: "installed" | "linked"; changed: true }
export interface AssemblyUpdateOutcome { name: string; state: "updated" | "unchanged" | "failed"; reason: string }
export interface AssemblyRemoval { name: string; kind: "installed" | "linked"; removed: true }

export class AssemblyCreationFailure extends Error {
  readonly result: ManagementResult;

  constructor(result: ManagementResult, reason: unknown) {
    super(reason instanceof Error ? reason.message : "Assembly creation failed.");
    this.name = "AssemblyCreationFailure";
    this.result = result;
  }
}

export class AssemblyUpdateFailure extends Error {
  readonly result: ManagementResult;

  constructor(result: ManagementResult, reason: unknown) {
    super(reason instanceof Error ? reason.message : "Assembly update failed.");
    this.name = "AssemblyUpdateFailure";
    this.result = result;
  }
}

class PublishedUpdateFailure extends Error {
  readonly outcome: AssemblyUpdateOutcome;
  readonly line: string;

  constructor(outcome: AssemblyUpdateOutcome, line: string, reason: unknown) {
    super(reason instanceof Error ? reason.message : "Assembly update cleanup failed.");
    this.name = "PublishedUpdateFailure";
    this.outcome = outcome;
    this.line = line;
  }
}

export class RemovalStateError extends Error {}

function refused(code: RefusalCode, path: string, sentence: string): ManagementResult {
  return { exitCode: 2, lines: [], faults: [{ code, path, sentence }] };
}

/** Where a name sits in the home; undefined for a name that would leave it. */
function targetFor(home: string, name: string): string | undefined {
  const parts = name.split("/");
  const escapes = parts.some((part) => part.length === 0 || part === "." || part === "..");
  return escapes ? undefined : join(home, "assemblies", ...parts);
}

/** The source and fetch time an installed assembly remembers, if it remembers. */
export async function provenance(path: string): Promise<{ source: string; updated: string } | undefined> {
  const file = join(path, ".bot-source");
  if (!existsSync(file)) return undefined;
  const [source = "", updated = ""] = (await readFile(file, "utf8")).split("\n");
  return { source, updated };
}

/** A link points at an assembly or it is broken (management.md) — the reader's own question, so a mark and a refusal cannot disagree. */
const brokenMark = (target: string): string => assemblyMarker(target) ? "" : "  BROKEN";

async function listLine(one: Held): Promise<string> {
  if (one.linked) return `${one.name}  linked  -> ${readlinkSync(one.path)}${brokenMark(one.path)}`;
  const from = await provenance(one.path);
  return from === undefined
    ? `${one.name}  installed  local copy`
    : `${one.name}  installed  from ${from.source}  updated ${from.updated}`;
}

async function list(input: ManageInput): Promise<ManagementResult> {
  if (input.args.length > 0) return refused("request-invalid", "list", "This verb takes no arguments.");
  const lines = await Promise.all(heldAssemblies(input.home).map(listLine));
  return { exitCode: lines.length === 0 ? 1 : 0, lines };
}

interface Download { root: string; scratch?: string; release?: () => void }
type Fetched = Download | { refusal: Refusal };
const downloaded = (held: Fetched): held is Download => !("refusal" in held);

// Shell-out, not a library (ADR 0010): a shallow clone into the scratch the
// runtime owns, the checkout's own .git dropped — what lands in the home is a
// copy, not a working tree — and the scratch removed by every path out.
async function clone(input: ManageInput, locator: string): Promise<Fetched> {
  // Under THIS home's scratch and owner-only (ticket 0140): a clone is somebody
  // else's tree arriving, and it sat world-readable at the shared root where no
  // sweep could prove whose it was. Keyed by the home, a staging directory a
  // SIGKILL stranded is an entry `bot prune` can name and no other home's prune
  // can reach — the same one derivation every run's scratch hangs off.
  const cache = scratchHome(scratchRoot(input.env), input.home);
  await mkdir(cache, { recursive: true, mode: OWNER_ONLY });
  const scratch = await mkdtemp(join(cache, "install-"));
  const root = join(scratch, "clone"), release = lockRun(scratch);
  const result = await runProcess({
    executable: { path: "git" },
    args: ["clone", "--quiet", "--depth", "1", locator, root],
    cwd: scratch, env: input.env, timeoutMs: FETCH_TIMEOUT, clock: input.clock,
  });
  if (result.captureIncomplete) {
    release(); await rm(scratch, { recursive: true, force: true });
    throw new Error("Git clone did not close its captured output after exiting.");
  }
  if (result.error !== undefined || result.exit !== 0) {
    release(); await rm(scratch, { recursive: true, force: true });
    return {
      refusal: errorCode(result.error) === "ENOENT"
        ? { code: "tool-missing", path: "git", sentence: "Install git and put it on PATH; installing from a git source runs it." }
        // One argument is tried as a folder here and then as a clone, so the
        // sentence covers both halves rather than the URL half (ticket 0128).
        : { code: "path-missing", path: locator, sentence: "Name a folder that exists or a source git can clone." },
    };
  }
  await rm(join(root, ".git"), { recursive: true, force: true });
  return { root: await realpath(root), scratch, release };
}

// Install COPIES, so what lands is frozen at its name: a source that is not an
// assembly would stand there listed by nothing and removable by nothing (ticket
// 0137). A link is read afresh at every read, so that one stays permissive.
function wrongSource(from: string, source: string): Refusal | undefined {
  if (!lstatExists(from)) return { code: "path-missing", path: source, sentence: "Name a source folder that exists." };
  return assemblyMarker(from) ? undefined : { code: "assembly-unknown", path: source, sentence: NOT_ONE };
}

function splitSource(source: string): { locator: string; subdir?: string } {
  const hash = source.lastIndexOf("#");
  return hash < 0
    ? { locator: source }
    : { locator: source.slice(0, hash), subdir: source.slice(hash + 1) };
}

async function discard(scratch: string | undefined, release?: () => void): Promise<void> {
  release?.();
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true });
}

/** Put `source`'s tree at `target` with its provenance; a refusal when it could not be fetched. */
async function fetchInto(input: ManageInput, source: string, target: string, storedLocal = false): Promise<Refusal | undefined> {
  const { locator, subdir } = splitSource(source);
  const local = resolve(input.cwd, locator);
  const localExists = lstatExists(local);
  // Absolute provenance written by install is local even after its source
  // disappears; update must not reinterpret it as a git locator.
  const held: Fetched = localExists || storedLocal
    ? { root: local }
    : await clone(input, locator);
  if (!downloaded(held)) return held.refusal;
  let staged: string | undefined;
  try {
    const root = localExists ? await realpath(held.root) : held.root;
    const from = subdir === undefined ? root : join(root, ...subdir.split("/"));
    const wrong = wrongSource(from, source);
    if (wrong !== undefined) return wrong;
    const selected = await realpath(from);
    const inside = relative(root, selected);
    if ([isAbsolute(inside), inside === "..", inside.startsWith(`..${sep}`)].includes(true)) return { code: "request-invalid", path: source, sentence: "Name a #subdir that stays inside its source folder." };
    // Made here and not in `install`, so a refusal above leaves no half-made
    // namespace behind and no home that only a refusal ever needed.
    await mkdir(dirname(target), { recursive: true, mode: OWNER_ONLY });
    staged = await mkdtemp(join(dirname(target), `.bot-install-${basename(target)}-`));
    await cp(selected, staged, { recursive: true, filter: (path) => path === selected || visible(basename(path)) });
    const provenance = localExists ? `${root}${source.slice(locator.length)}` : source;
    await writeFile(join(staged, ".bot-source"), `${provenance}\n${input.clock.timestamp()}\n`);
    await rename(staged, target);
    return undefined;
  } finally {
    await Promise.all([discard(held.scratch, held.release), discard(staged)]);
  }
}

interface Named { positional: string[]; name?: string; missing: boolean }

function named(args: string[]): Named {
  const at = args.indexOf("--name");
  if (at < 0) return { positional: args, missing: false };
  const name = args[at + 1];
  const positional = args.filter((_, index) => index !== at && index !== at + 1);
  return { positional, missing: name === undefined, ...(name === undefined ? {} : { name }) };
}

/** The name a source installs under: dot means the resolved current directory; otherwise use the last segment. */
function defaultName(source: string, cwd: string): string {
  const { locator, subdir } = splitSource(source);
  if (subdir === undefined && (locator === "." || locator === "./")) return basename(resolve(cwd, "."));
  const held = subdir ?? locator;
  const trimmed = held.replace(/\/+$/u, "").replace(/\.git$/u, "");
  return basename(trimmed);
}

export type AssemblyCreationRequest = { source: string; name: string } | { refusal: ManagementResult };

/** Parse the shared install/link source and name before either command publishes state. */
export function assemblyCreationRequest(input: Pick<ManageInput, "args" | "cwd">, link: boolean): AssemblyCreationRequest {
  const held = named(input.args);
  const source = held.positional[0];
  if (held.missing) return { refusal: refused("request-invalid", "--name", "Supply a value for --name.") };
  if (source === undefined || held.positional.length > 1) {
    return { refusal: refused("request-invalid", link ? "link" : "install", "Give one source and an optional --name.") };
  }
  const name = held.name ?? defaultName(source, input.cwd);
  if (name.startsWith("-")) return { refusal: refused("request-invalid", name, "Name an assembly that does not begin with a hyphen.") };
  return { source, name };
}

async function linkTo(input: ManageInput, source: string, name: string, target: string): Promise<ManagementResult> {
  const path = resolve(input.cwd, source);
  if (!lstatExists(path)) return refused("path-missing", source, "Name a working tree that exists.");
  await mkdir(dirname(target), { recursive: true, mode: OWNER_ONLY });
  await symlink(path, target);
  return { exitCode: 0, lines: [`${name}  linked  -> ${path}${brokenMark(path)}`], creation: { name, kind: "linked", changed: true } };
}

async function copyIn(input: ManageInput, source: string, name: string, target: string): Promise<ManagementResult> {
  const refusal = await fetchInto(input, source, target);
  if (refusal !== undefined) return { exitCode: 2, lines: [], faults: [refusal] };
  return { exitCode: 0, lines: [`${name}  installed  from ${source}`], creation: { name, kind: "installed", changed: true } };
}

async function installUnderClaim(input: ManageInput, link: boolean): Promise<ManagementResult> {
  const parsed = assemblyCreationRequest(input, link);
  if ("refusal" in parsed) return parsed.refusal;
  const { source, name } = parsed;
  const target = targetFor(input.home, name);
  if (target === undefined) return refused("request-invalid", name, "Name an assembly inside the home.");
  const removal = readRemovalIntent(input.home, name);
  if (removal !== undefined || lstatExists(target)) {
    return refused("request-invalid", name, "Remove the assembly of that name first; install never overwrites.");
  }
  return link ? linkTo(input, source, name, target) : copyIn(input, source, name, target);
}

// The staged tree is complete before renames move the old tree aside and the new tree in; its hidden names let the next update reclaim crash leftovers.
async function updateOne(input: ManageInput, one: Held, from: { source: string }): Promise<ManagementResult> {
  const beside = dirname(one.path);
  const staged = join(beside, `.bot-update-${basename(one.path)}`);
  const aside = join(beside, `.bot-old-${basename(one.path)}`);
  await Promise.all([staged, aside].map((path) => rm(path, { recursive: true, force: true })));
  const storedLocal = isAbsolute(from.source);
  const refusal = await fetchInto(input, from.source, staged, storedLocal);
  if (refusal !== undefined) return {
    exitCode: 2, lines: [], faults: [refusal],
    updates: [{ name: one.name, state: "failed", reason: refusal.sentence }],
  };
  await rename(one.path, aside);
  await input.afterAssemblyUpdateAside?.();
  await rename(staged, one.path);
  const line = `${one.name}  installed  updated from ${from.source}`;
  const reason = `Installed a replacement from ${from.source}.`;
  const outcome: AssemblyUpdateOutcome = { name: one.name, state: "updated", reason };
  return Promise.resolve().then(() => input.afterAssemblyUpdatePublish?.())
    .then(() => rm(aside, { recursive: true }))
    .then(
      () => ({ exitCode: 0, lines: [line], updates: [outcome] }),
      (failure: unknown) => Promise.reject(new PublishedUpdateFailure(
        { ...outcome, reason: `${reason} Cleanup failed: ${failure instanceof Error ? failure.message : "Assembly update cleanup failed."}` },
        line,
        failure,
      )),
    );
}

// A live run that names no assembly leaves nothing provably idle, and the one
// thing that cannot be done is pick which tree is safe: `remove` refuses for
// every name and `update` for every name it acts on — "where something does
// act on it, it refuses rather than proceeds" (inspection.md). Liveness is the
// whole key: a record-less run holding no lock blocks nothing, or one stale
// directory would brick this.
const UNPROVABLE = "A run in this home is still going and its record cannot be read, so bot cannot tell whether this assembly is in use. Wait for that run to end.";

// An assembly a run is still using is not swapped underneath it (management.md);
// liveness is that run's own lock, so a crashed run holds nothing. A link has
// no tree to swap, so the no-op above stands. Named, this is a fault like the
// one below it; in the walk over everything it is a line, for the same reason —
// a batch that refused partway would have already replaced the assemblies
// before it in name order and would then throw their lines away.
async function updateHeld(input: ManageInput, one: Held, live: Set<string> | undefined, byName: boolean): Promise<ManagementResult> {
  if (one.linked) return {
    exitCode: 0, lines: [`${one.name}  linked  already live`],
    updates: [{ name: one.name, state: "unchanged", reason: "The linked assembly is already live." }],
  };
  if (live === undefined) {
    const result = refused("assembly-in-use", one.name, UNPROVABLE);
    return { ...result, updates: [{ name: one.name, state: "failed", reason: UNPROVABLE }] };
  }
  if (live.has(one.name)) {
    const reason = "Wait for the run of that assembly to end; update never swaps a tree in use.";
    if (byName) {
      const result = refused("assembly-in-use", one.name, reason);
      return { ...result, updates: [{ name: one.name, state: "failed", reason }] };
    }
    return {
      exitCode: 0, lines: [`${one.name}  installed  in use by a live run, not updated`],
      updates: [{ name: one.name, state: "unchanged", reason }],
    };
  }
  const from = await provenance(one.path);
  if (from !== undefined) return updateOne(input, one, from);
  const reason = "This assembly has no .bot-source; there is nothing to fetch.";
  if (byName) {
    const result = refused("source-unknown", one.name, reason);
    return { ...result, updates: [{ name: one.name, state: "failed", reason }] };
  }
  return {
    exitCode: 0, lines: [`${one.name}  installed  local copy, nothing to fetch`],
    updates: [{ name: one.name, state: "unchanged", reason }],
  };
}

export type AssemblyUpdateSelection = { names: string[] } | { refusal: ManagementResult };

function assemblyUpdateSelection(input: Pick<ManageInput, "home" | "args">): AssemblyUpdateSelection {
  const name = input.args[0];
  if (input.args.length > 1) return { refusal: refused("request-invalid", "update", "Give at most one assembly name.") };
  const all = heldAssemblies(input.home);
  if (name !== undefined) {
    const one = all.find((held) => held.name === name);
    if (one === undefined) {
      const result = refused("assembly-unknown", name, "Name an assembly the home holds.");
      return { refusal: { ...result, updates: [{ name, state: "failed", reason: "Name an assembly the home holds." }] } };
    }
    return { names: [one.name] };
  }
  return { names: all.map((one) => one.name) };
}

async function claimedUpdateSelection(input: ManageInput): Promise<AssemblyUpdateSelection> {
  const selection = assemblyUpdateSelection(input);
  await input.afterAssemblyUpdateSelection?.();
  input.validateAssemblyUpdateSelection?.(selection);
  return selection;
}

async function updateUnderClaim(input: ManageInput): Promise<ManagementResult> {
  const selection = await claimedUpdateSelection(input);
  if ("refusal" in selection) return selection.refusal;
  const all = heldAssemblies(input.home);
  const live = await liveAssemblies(input.home);
  const selected = new Set(selection.names);
  const lines: string[] = [];
  const updates: AssemblyUpdateOutcome[] = [];
  for (const one of all.filter((held) => selected.has(held.name))) {
    const settled = await updateHeld(input, one, live, input.args.length === 1).then(
      (result) => ({ result }),
      (failure: unknown) => ({ failure }),
    );
    if ("failure" in settled) {
      const { failure } = settled;
      const message = failure instanceof Error ? failure.message : "Assembly update failed.";
      const published = failure instanceof PublishedUpdateFailure;
      const outcome: AssemblyUpdateOutcome = published
        ? failure.outcome
        : { name: one.name, state: "failed", reason: message };
      const result: ManagementResult = {
        exitCode: 2,
        lines: published ? [...lines, failure.line] : lines,
        updates: [...updates, outcome],
        updateTrouble: { name: one.name, reason: message },
      };
      throw new AssemblyUpdateFailure(result, failure);
    }
    const { result } = settled;
    updates.push(...(result.updates ?? []));
    if (result.faults !== undefined) return { ...result, lines: [...lines, ...result.lines], updates };
    lines.push(...result.lines);
  }
  return { exitCode: lines.length === 0 ? 1 : 0, lines, updates };
}

// A nested name makes its parent directories real (management.md), so removal
// gives back exactly those: an emptied namespace and no more. The raw read is
// the point — a surviving sibling keeps the namespace, and so does a hidden
// entry the walk would not have counted but a person would still miss.
async function pruneNamespaces(assemblies: string, name: string): Promise<void> {
  const parts = name.split("/").slice(0, -1);
  while (parts.length > 0) {
    const path = join(assemblies, ...parts);
    if (!existsSync(path)) { parts.pop(); continue; }
    if (readdirSync(path).length > 0) return;
    await rmdir(path);
    parts.pop();
  }
}

interface RemovalIntent {
  path: string;
  completedPath: string;
  quarantine: string;
  kind: AssemblyRemoval["kind"];
  device: string;
  inode: string;
  complete: boolean;
}

function removalHash(name: string): string {
  return createHash("sha256").update(name).digest("hex");
}

function removalPrefix(name: string, complete: boolean): string {
  return `.bot-remove${complete ? "d" : ""}-${removalHash(name)}-`;
}

function removalEntries(assemblies: string): Dirent[] {
  return existsSync(assemblies) ? readdirSync(assemblies, { withFileTypes: true }) : [];
}

function parseRemovalIntent(assemblies: string, name: string, prefix: string, complete: boolean, entry: Dirent): RemovalIntent {
  if (!entry.isFile()) throw new RemovalStateError("The assembly removal record is invalid.");
  const fields = /^(installed|linked)-(\d+)-(\d+)$/u.exec(entry.name.slice(prefix.length));
  if (fields === null) throw new RemovalStateError("The assembly removal record is invalid.");
  const kind = fields[1], device = fields[2], inode = fields[3];
  if ((kind !== "installed" && kind !== "linked") || device === undefined || inode === undefined) {
    throw new RemovalStateError("The assembly removal record is invalid.");
  }
  const suffix = `${kind}-${device}-${inode}`;
  return {
    path: join(assemblies, entry.name),
    completedPath: join(assemblies, `${removalPrefix(name, true)}${suffix}`),
    quarantine: join(assemblies, `.bot-removing-${removalHash(name)}-${suffix}`),
    kind, device, inode, complete,
  };
}

function readRemovalIntent(home: string, name: string): RemovalIntent | undefined {
  const assemblies = join(home, "assemblies");
  const active = removalPrefix(name, false), completed = removalPrefix(name, true);
  const matching = removalEntries(assemblies).filter((entry) => entry.name.startsWith(active) || entry.name.startsWith(completed));
  if (matching.length === 0) return undefined;
  if (matching.length !== 1) throw new RemovalStateError("The assembly removal record is invalid.");
  const entry = matching[0];
  if (entry === undefined) throw new RemovalStateError("The assembly removal record is invalid.");
  const complete = entry.name.startsWith(completed);
  return parseRemovalIntent(assemblies, name, complete ? completed : active, complete, entry);
}

async function targetIdentity(path: string): Promise<{ device: string; inode: string; linked: boolean } | undefined> {
  return lstat(path, { bigint: true }).then(
    (held) => ({ device: String(held.dev), inode: String(held.ino), linked: held.isSymbolicLink() }),
    (reason: unknown) => {
      if (errorCode(reason) === "ENOENT") return undefined;
      throw reason;
    },
  );
}

async function beginRemoval(home: string, name: string, one: Held): Promise<RemovalIntent> {
  const identity = await targetIdentity(one.path);
  if (identity === undefined || identity.linked !== one.linked) throw new RemovalStateError("The assembly changed before removal began.");
  const kind = one.linked ? "linked" : "installed";
  const assemblies = join(home, "assemblies"), suffix = `${kind}-${identity.device}-${identity.inode}`;
  const path = join(assemblies, `${removalPrefix(name, false)}${suffix}`);
  await writeFile(path, "", { flag: "wx", mode: 0o600 });
  return {
    path,
    completedPath: join(assemblies, `${removalPrefix(name, true)}${suffix}`),
    quarantine: join(assemblies, `.bot-removing-${removalHash(name)}-${suffix}`),
    kind, device: identity.device, inode: identity.inode, complete: false,
  };
}

async function verifyRemovalTarget(path: string, intent: RemovalIntent): Promise<boolean> {
  const identity = await targetIdentity(path);
  if (identity === undefined) return false;
  if (identity.device !== intent.device || identity.inode !== intent.inode
    || identity.linked !== (intent.kind === "linked")) {
    throw new RemovalStateError("The assembly changed during removal.");
  }
  return true;
}

async function moveRemovalTarget(target: string, intent: RemovalIntent): Promise<boolean> {
  if (await targetIdentity(intent.quarantine) === undefined) {
    const moved = await rename(target, intent.quarantine).then(
      () => true,
      (reason: unknown) => {
        if (errorCode(reason) === "ENOENT") return false;
        throw reason;
      },
    );
    if (!moved) return false;
  }
  return verifyRemovalTarget(intent.quarantine, intent);
}

async function removeQuarantinedTarget(intent: RemovalIntent): Promise<void> {
  if (intent.kind === "linked") await unlink(intent.quarantine);
  else await rm(intent.quarantine, { recursive: true });
}

async function completeRemoval(target: string, intent: RemovalIntent): Promise<RemovalIntent> {
  if (intent.complete) return intent;
  if (await moveRemovalTarget(target, intent)) await removeQuarantinedTarget(intent);
  await rename(intent.path, intent.completedPath);
  return { ...intent, path: intent.completedPath, complete: true };
}

async function finishRemovalIntent(path: string): Promise<void> {
  await unlink(path).catch((reason: unknown) => {
    if (errorCode(reason) !== "ENOENT") throw reason;
  });
}

interface AssemblyMutationClaim { release(): Promise<void> }

async function claimAssemblyMutation(assemblies: string): Promise<AssemblyMutationClaim> {
  const state: { compromised?: Error } = {};
  const releaseLock = await lock(assemblies, {
    ...ASSEMBLY_MUTATION_LOCK,
    onCompromised: (cause: Error) => { state.compromised = cause; },
  });
  return {
    release: async () => {
      const before = state.compromised;
      if (before !== undefined) throw before;
      await releaseLock();
      const after = state.compromised;
      if (after !== undefined) throw after;
    },
  };
}

async function install(input: ManageInput, link: boolean): Promise<ManagementResult> {
  const parsed = assemblyCreationRequest(input, link);
  if ("refusal" in parsed) return parsed.refusal;
  const homeExisted = lstatExists(input.home);
  if (!homeExisted) await mkdir(input.home, { recursive: true, mode: OWNER_ONLY });
  const claim = await claimAssemblyMutation(join(input.home, "assemblies"));
  const cleanupHome = async (): Promise<void> => {
    if (!homeExisted) {
      await rmdir(input.home).catch((reason: unknown) => {
        if (!["ENOENT", "ENOTEMPTY"].includes(errorCode(reason) ?? "")) throw reason;
      });
    }
  };
  return installUnderClaim(input, link).then(
    (result) => claim.release().then(
      async () => { await cleanupHome(); return result; },
      (reason: unknown) => {
        if (result.creation === undefined) throw reason;
        throw new AssemblyCreationFailure({ ...result, exitCode: 2 }, reason);
      },
    ),
    (reason: unknown) => claim.release().then(
      async () => { await cleanupHome(); throw reason; },
      () => { throw reason; },
    ),
  );
}

async function update(input: ManageInput): Promise<ManagementResult> {
  const assemblies = join(input.home, "assemblies");
  const homeExisted = lstatExists(input.home);
  if (!homeExisted) await mkdir(input.home, { recursive: true, mode: OWNER_ONLY });
  const cleanupHome = async (): Promise<void> => {
    if (!homeExisted) {
      await rmdir(input.home).catch((reason: unknown) => {
        if (!["ENOENT", "ENOTEMPTY"].includes(errorCode(reason) ?? "")) throw reason;
      });
    }
  };
  const claim = await claimAssemblyMutation(assemblies).catch(async (reason: unknown) => {
    await cleanupHome();
    throw reason;
  });
  return updateUnderClaim(input).then(
    (result) => claim.release().then(
      async () => { await cleanupHome(); return result; },
      (reason: unknown) => {
        const message = reason instanceof Error ? reason.message : "Assembly update lock release failed.";
        throw new AssemblyUpdateFailure({
          ...result, exitCode: 2,
          updateTrouble: { name: result.updates?.at(-1)?.name ?? "update", reason: message },
        }, reason);
      },
    ),
    (reason: unknown) => claim.release().then(
      async () => { await cleanupHome(); throw reason; },
      () => { throw reason; },
    ),
  );
}

type RemovalPreparation = { intent: RemovalIntent } | { refusal: ManagementResult };

async function prepareRemoval(input: ManageInput, name: string): Promise<RemovalPreparation> {
  const one = heldAssemblies(input.home).find((held) => held.name === name);
  let intent = readRemovalIntent(input.home, name);
  if (one === undefined && intent === undefined) {
    return { refusal: refused("assembly-unknown", name, "Name an assembly the home holds.") };
  }
  const live = await liveAssemblies(input.home);
  if (live === undefined) return { refusal: refused("assembly-in-use", name, UNPROVABLE) };
  if (live.has(name)) {
    return { refusal: refused("assembly-in-use", name, "Wait for the run of that assembly to end; remove never takes a tree in use.") };
  }
  if (intent === undefined) {
    if (one === undefined) throw new RemovalStateError("The assembly removal record lost its target.");
    intent = await beginRemoval(input.home, name, one);
  }
  return { intent };
}

interface SettledRemoval { result: ManagementResult; intentPath?: string }

async function settleRemoval(input: ManageInput, name: string, target: string): Promise<SettledRemoval> {
  // The exact installed leaf or its durable removal intent owns the target.
  // A namespace directory alone never authorizes recursive deletion.
  const prepared = await prepareRemoval(input, name);
  if ("refusal" in prepared) return { result: prepared.refusal };
  const intent = await completeRemoval(target, prepared.intent);
  // A replacement published after the original moved aside remains at the
  // public target. The completed intent no longer authorizes deleting it.
  if (await targetIdentity(target) !== undefined) {
    throw new RemovalStateError("The assembly target was replaced during removal; the replacement was retained.");
  }
  await pruneNamespaces(join(input.home, "assemblies"), name);
  return {
    intentPath: intent.path,
    result: { exitCode: 0, lines: [`${name}  removed`], removal: { name, kind: intent.kind, removed: true } },
  };
}

async function remove(input: ManageInput): Promise<ManagementResult> {
  const name = input.args[0];
  if (name === undefined || input.args.length > 1) return refused("request-invalid", "remove", "Give one assembly name.");
  const target = targetFor(input.home, name);
  if (target === undefined) return refused("request-invalid", name, "Name an assembly inside the home.");
  const assemblies = join(input.home, "assemblies");
  if (!lstatExists(assemblies)) return refused("assembly-unknown", name, "Name an assembly the home holds.");
  // One stable lock owns every phase and pathname of removal settlement. A
  // concurrent caller retries instead of sharing an intent or quarantine.
  const claim = await claimAssemblyMutation(assemblies);
  let settled: SettledRemoval;
  try {
    settled = await settleRemoval(input, name, target);
  } finally {
    await claim.release();
  }
  // The completed marker survives release failure. After a successful release,
  // cleanup is safe for this caller, a concurrent retry, or a crash retry.
  if (settled.intentPath !== undefined) await finishRemovalIntent(settled.intentPath);
  return settled.result;
}

/** Run one `bot assembly` verb; the bare noun lists. */
export async function manage(input: ManageInput): Promise<ManagementResult> {
  switch (input.verb) {
    case "list": return list(input);
    case "install": return install(input, false);
    case "link": return install(input, true);
    case "update": return update(input);
    case "remove": return remove(input);
    default: return refused("request-invalid", input.verb, "Use list, install, link, update, or remove.");
  }
}
