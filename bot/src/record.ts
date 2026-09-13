// The record's writer and hashing plumbing. The event shapes it serializes
// live in record-events.ts; the bytes on disk are produced only here.
import { createHash } from "node:crypto";
import { constants, createWriteStream, type Dirent } from "node:fs";
import { appendFile, chmod, lstat, mkdir, open, readFile, readdir, readlink, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { DEFAULT_ASSEMBLY_TRAVERSAL_POLICY, includeAssemblyRoot, parseAssemblyTraversalPolicy, policyForRootEntries, type AssemblyTraversalPolicy, type ParsedAssemblyTraversalPolicy } from "./assembly-policy.ts";
import { readMarkdown } from "./documents.ts";
import { OWNER_ONLY, bytewise, errorCode, visible } from "./model.ts";
import { mapPool } from "./pool.ts";
import type { HashedPath, RecordEvent, RunStartEvent } from "./record-events.ts";

export interface RecordWriter {
  runDirectory: string;
  recordPath: string;
  failure: Promise<unknown>;
  start(first: RunStartEvent): Promise<void>;
  append(event: Exclude<RecordEvent, RunStartEvent>): Promise<void>;
  drain(): Promise<void>;
}

export type CreateRecordResult =
  | { status: "created"; writer: RecordWriter }
  | { status: "taken"; runDirectory: string };

function line(event: RecordEvent): string {
  return `${compactJson(event)}\n`;
}

function appendRunEnd(recordPath: string, event: Exclude<RecordEvent, RunStartEvent>): Promise<void> {
  return open(recordPath, "a").then((handle) => handle.appendFile(line(event), "utf8")
    .then(() => handle.sync())
    .then(
      () => handle.close(),
      (reason: unknown) => {
        const preserve = (): never => { throw reason; };
        return handle.close().then(preserve, preserve);
      },
    ));
}

// Serialization stays in this file (doctrine rule 5); non-record JSON files
// the runtime owns (the credential store) import their bytes from here.
// Two-space indent matches pi-coding-agent's credential file byte-for-byte.
export function compactJson(value: unknown): string {
  return JSON.stringify(value);
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function recordWriter(runDirectory: string): RecordWriter {
  const recordPath = join(runDirectory, "record.jsonl");
  let barrier = Promise.resolve();
  let closed = false;
  let failed = false;
  let firstFailure: unknown;
  let publishFailure: (reason: unknown) => void = () => undefined;
  const failure = new Promise<unknown>((resolve) => { publishFailure = resolve; });
  const handled = (pending: Promise<void>): Promise<void> => {
    void pending.catch(() => undefined);
    return pending;
  };
  const refuseClosed = (): Promise<void> => handled(Promise.reject(new Error("Record writer is closed.")));
  const queue = (write: () => Promise<void>): Promise<void> => {
    const pending = barrier.then(() => failed
      ? Promise.reject(new Error("Record writer is closed."))
      : write().then(undefined, (reason: unknown) => {
        failed = true;
        closed = true;
        firstFailure = reason;
        publishFailure(reason);
        throw reason;
      }));
    barrier = pending.then(() => undefined, () => undefined);
    return handled(pending);
  };
  return {
    runDirectory,
    recordPath,
    failure,
    start(first) {
      return closed ? refuseClosed() : queue(() => writeFile(recordPath, line(first), { encoding: "utf8", flag: "wx" }));
    },
    append(event) {
      if (closed) return refuseClosed();
      if (event.event === "run_end") {
        closed = true;
        return queue(() => appendRunEnd(recordPath, event));
      }
      return queue(() => appendFile(recordPath, line(event), "utf8"));
    },
    async drain() {
      await barrier;
      if (failed) throw firstFailure;
    },
  };
}

// The directory alone, with its record not yet begun. Birth writes `run_start`
// only once the capture is on disk and has validated (ADR 0016 steps 3-6), and
// between those two moments the run is mid-birth. The listing omits it until
// its record can be read, rather than publishing an incomplete reading (0088).
export function claimRunDirectory(runsDirectory: string, run: string): Promise<CreateRecordResult> {
  const runDirectory = join(runsDirectory, run);
  return mkdir(runDirectory, { mode: OWNER_ONLY }).then(
    () => ({ status: "created" as const, writer: recordWriter(runDirectory) }),
    (reason: unknown) => {
      if (errorCode(reason) === "EEXIST") return { status: "taken" as const, runDirectory };
      return Promise.reject(reason instanceof Error ? reason : new Error("Run directory creation failed", { cause: reason }));
    },
  );
}

export async function createRecordWriter(runsDirectory: string, first: RunStartEvent): Promise<CreateRecordResult> {
  const claimed = await claimRunDirectory(runsDirectory, first.run);
  if (claimed.status === "created") await claimed.writer.start(first);
  return claimed;
}

export function hashBytes(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function hashFile(path: string): Promise<string> {
  return hashBytes(await readFile(path));
}

// The one walk of an assembly tree, for the hash and for the capture alike
// (CHECKLIST 9). Visible entries only; a symbolic link is carried as one so the
// capture can reproduce it and the reader can refuse it in its own words
// (assembly.md's ban) — everything else that is not a regular file has no
// spelling in an assembly at all, and stops the walk.
type AssemblyEntry = { path: string; link: true } | { path: string; link: false; dev: bigint; ino: bigint };

async function walkAssemblyEntry(
  directory: string,
  policy: AssemblyTraversalPolicy,
  prefix: string,
  entry: Dirent,
): Promise<AssemblyEntry[]> {
  const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
  if (entry.isDirectory()) return walkAssembly(join(directory, entry.name), policy, path);
  if (entry.isFile()) {
    const observed = await lstat(join(directory, entry.name), { bigint: true });
    return [{ path, link: false, dev: observed.dev, ino: observed.ino }];
  }
  if (entry.isSymbolicLink()) return [{ path, link: true }];
  throw new Error(`Unsupported assembly entry while hashing: ${path}`);
}

async function walkAssembly(
  directory: string,
  policy: AssemblyTraversalPolicy,
  prefix = "",
  listed?: readonly Dirent[],
): Promise<AssemblyEntry[]> {
  const held: AssemblyEntry[] = [];
  const directoryEntries = listed ?? await readdir(directory, { withFileTypes: true });
  for (const entry of directoryEntries) {
    if (!visible(entry.name) || (prefix.length === 0 && !includeAssemblyRoot(policy, entry))) continue;
    held.push(...await walkAssemblyEntry(directory, policy, prefix, entry));
  }
  return held;
}

function parsedPolicyFromManifest(manifest: string): ParsedAssemblyTraversalPolicy {
  const document = readMarkdown(manifest, "ASSEMBLY.md", []);
  return document.sound
    ? parseAssemblyTraversalPolicy(document.data)
    : { policy: DEFAULT_ASSEMBLY_TRAVERSAL_POLICY, invalid: ["folders"] };
}

function rootedPolicy(root: string, listed: readonly Dirent[]): AssemblyTraversalPolicy {
  return policyForRootEntries(parsedPolicyFromManifest(join(root, "ASSEMBLY.md")), listed).policy;
}

const byPath = (a: AssemblyEntry, b: AssemblyEntry): number => bytewise(a.path, b.path);

/** Where a run's copy sits under its run directory (`record.md`) — one name, so
 *  birth writes and `bot status` weighs the same directory. */
export const CAPTURE = "assembly";

// The run's private copy (ADR 0016). `captured` is awaited after each file
// lands: the seam the capture-window tests hold a run at, and the copy's only
// pause.
//
// THE SEAL (step 4): a captured file loses its write bits as it lands and keeps
// every other, the executable one included — so no file the run executes or is
// judged by is writable while the run is alive. FILES, NOT DIRECTORIES: a
// non-writable directory also stops `rm` from unlinking what is inside it, and a
// run a person cannot `rm -rf` is the surprise CHECKLIST 2 and 3 forbid, so
// `bot prune --delete` would owe a chmod pass it does not owe. Read-only files
// unlink exactly as writable ones do. What the seal stops is the write invariant
// 14 was written for — a gate rewritten in place; unlinking it and writing
// another still works, and is meant to. A tripwire, not a sandbox. A link is
// never chmod'd, because chmod follows it out of the run entirely.
async function captureEntry(source: string, destination: string, entry: AssemblyEntry): Promise<{ status: "captured" } | { status: "mismatched"; path: string }> {
  const parts = entry.path.split("/");
  const to = join(destination, ...parts);
  const from = join(source, ...parts);
  await mkdir(join(destination, ...parts.slice(0, -1)), { recursive: true });
  if (entry.link) await symlink(await readlink(from), to);
  else {
    const handle = await open(from, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { const opened = await handle.stat({ bigint: true });
      // No-follow pins the leaf kind; dev/ino pins the walked object if a parent changed.
      if (!opened.isFile() || opened.dev !== entry.dev || opened.ino !== entry.ino) return { status: "mismatched", path: entry.path };
      await pipeline(handle.createReadStream({ autoClose: false }), createWriteStream(to));
      await chmod(to, Number(opened.mode) & 0o777 & ~0o222);
    } finally { await handle.close(); }
  }
  return { status: "captured" };
}

export async function captureAssembly(source: string, destination: string, captured?: (file: string) => Promise<void>): Promise<{ status: "captured" } | { status: "mismatched"; path: string }> {
  const manifest = await lstat(join(source, "ASSEMBLY.md"), { bigint: true }).then(
    (observed) => observed.isFile() ? { path: "ASSEMBLY.md", link: false as const, dev: observed.dev, ino: observed.ino } : undefined,
    (reason: unknown) => errorCode(reason) === "ENOENT"
      ? undefined
      : Promise.reject(reason instanceof Error ? reason : new Error("Assembly manifest inspection failed", { cause: reason })),
  );
  let parsed: ParsedAssemblyTraversalPolicy = {
    policy: DEFAULT_ASSEMBLY_TRAVERSAL_POLICY,
    invalid: ["folders"],
  };
  if (manifest !== undefined) {
    const result = await captureEntry(source, destination, manifest);
    if (result.status === "mismatched") return result;
    parsed = parsedPolicyFromManifest(join(destination, "ASSEMBLY.md"));
  }
  const listed = await readdir(source, { withFileTypes: true });
  const policy = policyForRootEntries(parsed, listed).policy;
  const walked = await walkAssembly(source, policy, "", listed);
  const ordered = manifest === undefined
    ? walked.sort(byPath)
    : [...walked.filter((entry) => entry.path !== "ASSEMBLY.md"), manifest].sort(byPath);
  for (const entry of ordered) {
    if (entry !== manifest) {
      const result = await captureEntry(source, destination, entry);
      if (result.status === "mismatched") return result;
    }
    await captured?.(entry.path);
  }
  return { status: "captured" };
}

export interface AssemblyPrehash {
  sha256: string;
  files: ReadonlyMap<string, string>;
}

export interface AssemblyHashEntry {
  path: string;
  sha256: string;
  executable: boolean;
}

/** The aggregate identity shared by assembly validation and retained-copy
 * inspection. Callers establish the bytes and executable bit at their own
 * filesystem boundary; this function owns the hash dialect. */
export function hashAssemblyEntries(entries: readonly AssemblyHashEntry[]): string {
  const ordered = [...entries].sort((left, right) => bytewise(left.path, right.path));
  return hashBytes(ordered.map(({ path, sha256, executable }) => `${path}:${sha256}${executable ? ":x" : ""}`).join("\n"));
}

/** Ian's ruling, 2026-08-05: eight files hashed at once, whatever the tree
 *  holds. `captureAssembly` above stays sequential and unpooled — its
 *  `captured` seam is per-file and ordered (CHECKLIST 2: no configuration). */
export const HASH_IN_FLIGHT = 8;

export async function prehashAssembly(root: string): Promise<AssemblyPrehash> {
  // ADR 0016: an executable file's line is `path:hash:x`. The bit joins the
  // aggregate identity because a gate's behavior depends on it; the per-file
  // hash invariant 14 compares against stays the hash of the bytes alone. A
  // link cannot be here — validation refuses one over the capture, before
  // anything hashes it — and hashing one would follow it, so it stops instead.
  const listed = await readdir(root, { withFileTypes: true });
  const policy = rootedPolicy(root, listed);
  const lines = await mapPool((await walkAssembly(root, policy, "", listed)).sort(byPath), HASH_IN_FLIGHT, async ({ path, link }) => {
    if (link) throw new Error(`Unsupported assembly entry while hashing: ${path}`);
    const file = join(root, ...path.split("/"));
    return [path, await hashFile(file), ((await stat(file)).mode & 0o111) === 0 ? "" : ":x"] as const;
  });
  const entries = lines.map(([path, sha256, mark]) => ({ path, sha256, executable: mark.length > 0 }));
  return { sha256: hashAssemblyEntries(entries), files: new Map(lines.map(([path, sha256]) => [path, sha256])) };
}

export type ExecutableHash =
  | { status: "unchanged"; file: string; sha256: string }
  | { status: "drifted"; file: string; expected: string; actual: string; exit: 2; cause: "fault" };

export async function rehashExecutable(path: string, file: string, expected: string): Promise<ExecutableHash> {
  const actual = await hashFile(path);
  return actual === expected
    ? { status: "unchanged", file, sha256: actual }
    : { status: "drifted", file, expected, actual, exit: 2, cause: "fault" };
}

export interface PassedOutput { diskPath: string; output: HashedPath }

// One candidate per attempt (ticket 0072): the digest is of the bytes that were
// judged, not a re-read of the live path, so sealOutput covers capture to seal.
export function passedOutput(diskPath: string, path: string, bytes: Buffer): PassedOutput {
  return { diskPath, output: { path, sha256: hashBytes(bytes) } };
}

export type SealResult =
  | { status: "sealed"; output: HashedPath; sealed: true; judged: true }
  | { status: "drifted"; drift: { file: string; expected: string; actual: string }; exit: 2; cause: "fault"; reason: string };

export async function sealOutput(passed: PassedOutput): Promise<SealResult> {
  const actual = await hashFile(passed.diskPath);
  if (actual === passed.output.sha256) {
    return { status: "sealed", output: passed.output, sealed: true, judged: true };
  }
  return {
    status: "drifted",
    drift: { file: passed.output.path, expected: passed.output.sha256, actual },
    exit: 2,
    cause: "fault",
    reason: `Output changed after its checks passed: ${passed.output.path}`,
  };
}
