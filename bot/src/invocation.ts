import { lstatSync } from "node:fs";
import { readlink, symlink, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { TIMEOUT_MAX, assemblyMarker, lstatExists, readMarkdown, validateData } from "./documents.ts";
import { readYamlOptions } from "./home-config.ts";
import { LOCAL_CONTEXTS, OPTION_NAMES, errorCode, fault, type AuthoredOptions, type HomeConfig, type Invocation, type Target } from "./model.ts";
import { hashBytes } from "./record.ts";
import type { Refusal } from "./spine.ts";

function words(source: string): string[] {
  // Single-character alternatives with disjoint first characters: the match is
  // deterministic, so parsing stays linear on any input (no backtracking blowup).
  const held = source.match(/(?:[^\s"'\\]|\\.|"(?:\\.|[^"\\])*"|'[^']*')+/g) ?? [];
  return held.map((word) => {
    const quoted = (word.startsWith('"') && word.endsWith('"')) || (word.startsWith("'") && word.endsWith("'"));
    const inner = quoted ? word.slice(1, -1) : word;
    return inner.replace(/\\(.)/g, "$1");
  });
}

// The two integer flags, bounded on the command rung exactly as documents.ts
// bounds them on the authored rungs — `timeout` from above as well as below.
function numberValue(name: string, raw: string, faults: Refusal[]): number {
  const value = Number(raw);
  const [least, most] = name === "timeout" ? [1, TIMEOUT_MAX] : [0, Number.POSITIVE_INFINITY];
  if (!Number.isInteger(value) || value < least || value > most) {
    fault(faults, "value-invalid", `--${name}`, `Give --${name} a valid integer.`);
  }
  return value;
}

function commandValue(name: string, raw: string, faults: Refusal[]): string | number {
  if (name === "timeout" || name === "retries") return numberValue(name, raw, faults);
  if (name === "local-context" && !new Set<string>(LOCAL_CONTEXTS).has(raw)) {
    fault(faults, "value-invalid", "--local-context", "Give --local-context ignore, announce, or use.");
  }
  return raw;
}

// There is always a home (home.md), so nothing downstream refuses to resolve
// one — three branches did, two under different codes (ticket 0133).
export function resolveHome(dir: string, raw: string | undefined, env: NodeJS.ProcessEnv): string {
  if (raw !== undefined) return resolve(dir, raw);
  if (env["BOT_HOME"] !== undefined) return resolve(dir, env["BOT_HOME"]);
  return join(xdgBase(env, "XDG_DATA_HOME", ".local", "share"), "bot");
}

// One reading of an XDG base directory, for the three bot derives paths from:
// the variable when it names an absolute path, the documented default under
// `$HOME` otherwise. A RELATIVE value is invalid and ignored — the basedir
// specification says so in as many words — and it had to be, because joining
// one produced a path that meant a different directory to every process that
// read it. HOME and the XDG names come from the injected environment, never
// the ambient one (ticket 0144 made this one function of three).
function xdgBase(env: NodeJS.ProcessEnv, variable: string, ...fallback: string[]): string {
  const named = env[variable];
  return named !== undefined && isAbsolute(named) ? named : join(env["HOME"] ?? homedir(), ...fallback);
}

// Scratch sits outside the home so no slot value discloses where runs live
// (slots.md).
export function scratchRoot(env: NodeJS.ProcessEnv): string {
  return join(xdgBase(env, "XDG_CACHE_HOME", ".cache"), "bot", "tmp");
}

// Bot's own credential file (ADR 0017), machine-wide rather than per-home: a
// login belongs to the operator and a home is a workspace, so one login serves
// every home. There is no bot-named variable for it — redirection is
// `XDG_CONFIG_HOME`, a platform convention rather than a bot invention.
export function credentialPath(env: NodeJS.ProcessEnv): string {
  return join(xdgBase(env, "XDG_CONFIG_HOME", ".config"), "bot", "credentials.json");
}

// The scratch a HOME owns, and the run's under it (ticket 0140). Keyed by the
// run's basename alone, two homes minting one name — a second and two random
// bytes — shared one directory: two live runs writing into each other's `$TMP`,
// and `bot prune --delete` in either one `rm -rf`ing the other's scratch, which
// is prune's prime directive broken across homes. Reproduced before it was
// fixed. The home is a LEVEL rather than part of the leaf so prune can
// enumerate what is provably its own and nothing else (inspection.md); hashed
// the way `scratchAttempt` hashes, so the level discloses no home and every
// reader recomputes it. The run's own name stays the entry under it — 0067's
// opacity rule begins BELOW the run, and `bot show` prints that name already.
export function scratchHome(root: string, home: string): string {
  return join(root, hashBytes(`${root}:${home}`).slice(0, 16));
}

export function scratchOfRun(root: string, home: string, run: string): string {
  return join(scratchHome(root, home), run);
}

// Below `<scratch>/<run>/` the tree names nothing (ticket 0067): one opaque
// directory per stage attempt, so the one channel the runtime does not compose
// — a shell expanding `$OUTPUT` itself — names no stage, flow or repeat. Hashed
// the way run.ts hashes a session id, not random: no ambient source enters and
// `bot show` recomputes it. The run's root is in the key, so one stage in two
// runs is two names.
export function scratchAttempt(root: string, key: string): string {
  return join(root, hashBytes(`${root}:${key}`).slice(0, 16));
}

// Unix sockets require the short POSIX host namespace rather than a caller's
// TMPDIR, which can itself be a long stage-scoped path.
const TEMPORARY_HANDLE_DIRECTORY = "/tmp";

// A stage receives this opaque alias rather than the retained cache path: Unix
// sockets then fit, while scratch's ownership and inspection layout stay put.
export function temporaryHandle(backing: string): string {
  return join(TEMPORARY_HANDLE_DIRECTORY, `bot-${hashBytes(backing)}`);
}

function rejected(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("Temporary handle setup failed with a non-Error value.", { cause: reason });
}

function requireTemporaryHandle(backing: string): Promise<void> {
  const handle = temporaryHandle(backing);
  return readlink(handle).then((target) => {
    if (target !== backing) throw new Error("A temporary handle names another backing path.");
  });
}

export function createTemporaryHandle(backing: string): Promise<string> {
  const handle = temporaryHandle(backing);
  return symlink(backing, handle, "dir").then(
    () => handle,
    (reason: unknown) => errorCode(reason) === "EEXIST"
      ? requireTemporaryHandle(backing).then(() => handle)
      : Promise.reject(rejected(reason)),
  );
}

// Verify the target before unlinking: a colliding or replaced host-temp entry
// must never let one scope's cleanup remove another scope's handle.
export function removeTemporaryHandle(backing: string): Promise<void> {
  return requireTemporaryHandle(backing).then(() => unlink(temporaryHandle(backing))).then(
    () => undefined,
    (reason: unknown) => errorCode(reason) === "ENOENT" ? undefined : Promise.reject(rejected(reason)),
  );
}

// The key a stage attempt hashes to. The runtime spells it to MAKE the
// directory and a reading spells it to find that same directory again, so it is
// spelled here and nowhere else: two spellings that drift leave `bot show`
// naming a path no stage ever worked in (ticket 0122). Not the identity
// `bot show` prints — that is `stage#repeat`, and this is a hash input.
export const attemptKey = (stage: string, repeat: number | undefined): string => `${stage}:${String(repeat ?? 1)}`;

interface SplitInvocation {
  target: string;
  rawOptions: Map<string, string>;
  valueless: Set<string>;
  requests: string[];
}

// One `--key [value]` token; answers whether the next token was its value. The
// key is carried on either way: `--verbose` is an option that does not exist
// before it is one with no value, and inviting a value for it was the wrong fix
// in the wrong order (ticket 0128).
function takeOption(token: string, next: string | undefined, split: SplitInvocation): boolean {
  const given = next === undefined || next.startsWith("--") ? undefined : next;
  split.rawOptions.set(token.slice(2), given ?? "");
  if (given === undefined) split.valueless.add(token.slice(2));
  return given !== undefined;
}

function refuseManyRequests(split: SplitInvocation, faults: Refusal[]): void {
  if (split.requests.length > 1) {
    fault(faults, "request-invalid", split.requests[1] ?? split.target, "Give at most one request.");
  }
}

function splitInvocation(tokens: string[], faults: Refusal[]): SplitInvocation {
  const split: SplitInvocation = { target: tokens[0] ?? "", rawOptions: new Map(), valueless: new Set(), requests: [] };
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.startsWith("--") === true) {
      if (takeOption(token, tokens[index + 1], split)) index += 1;
    } else if (token !== undefined) split.requests.push(token);
  }
  refuseManyRequests(split, faults);
  return split;
}

// `--` belongs to run, not to the source-string and check reader. Before it,
// every word is read by the established long-option rule; after it, no word is
// an option, so the target and every request word stay positional.
function splitRunInvocation(tokens: string[], faults: Refusal[]): SplitInvocation {
  const marker = tokens.indexOf("--");
  if (marker < 0) return splitInvocation(tokens, faults);
  const suffix = tokens.slice(marker + 1);
  const split: SplitInvocation = { target: suffix[0] ?? "", rawOptions: new Map(), valueless: new Set(), requests: suffix.slice(1) };
  for (let index = 0; index < marker; index += 1) {
    const token = tokens[index];
    if (token?.startsWith("--") === true && takeOption(token, tokens[index + 1], split)) index += 1;
  }
  refuseManyRequests(split, faults);
  return split;
}

const RETIRED_MODEL_OPTIONS = ["model", "provider", "reasoning", "profile", "tier"] as const;

function extractCommandOptions(rawOptions: Map<string, string>, valueless: ReadonlySet<string>, faults: Refusal[]): AuthoredOptions {
  const commandOptions: AuthoredOptions = {};
  for (const name of OPTION_NAMES) {
    const raw = rawOptions.get(name);
    if (raw !== undefined && !valueless.has(name)) commandOptions[name] = commandValue(name, raw, faults);
    rawOptions.delete(name);
  }
  for (const name of RETIRED_MODEL_OPTIONS) {
    if (rawOptions.has(name)) {
      fault(faults, "key-unknown", `--${name}`, `Remove the retired option --${name}; define the choice in the home intelligences table and name it with --intelligence.`);
      rawOptions.delete(name);
    }
  }
  return commandOptions;
}

// `request.` and the extension are one directory entry, and POSIX bounds one at
// 255 bytes (NAME_MAX): a longer one threw as the run was written, with the
// record already open. The suffix is ASCII below, so its length is its bytes.
const EXTENSION_MAX = 255 - "request.".length;

interface RequestInfo {
  extension: string;
  options: AuthoredOptions;
  request?: Invocation["request"];
}

function readRequest(request: string | undefined, dir: string, faults: Refusal[]): RequestInfo {
  if (request?.startsWith("@") !== true) {
    return request === undefined
      ? { extension: "txt", options: {} }
      : { extension: "txt", options: {}, request: { body: request, via: "argument" } };
  }
  const taskName = request.slice(1);
  const taskPath = resolve(dir, taskName);
  // The request "keeps the extension of the task file it came from" (slots.md)
  // — the FILE's, so the suffix comes from the basename. Read off the whole
  // argument, `@notes.d/task` gave `d/task`, so `request.d/task` was a name
  // that is a path, written into a missing directory after the record's birth.
  // A leading dot is a hidden file, and anything that is not a plain suffix
  // falls back to `txt`.
  const extension = /(?<=.)\.([A-Za-z0-9]+)$/u.exec(basename(taskName))?.[1] ?? "txt";
  if (extension.length > EXTENSION_MAX) {
    fault(faults, "value-invalid", taskName, `Rename the task file with an extension of at most ${String(EXTENSION_MAX)} characters.`);
  }
  if (!lstatExists(taskPath)) {
    fault(faults, "path-missing", taskName, "Create the requested task file.");
    return { extension, options: {} };
  }
  const path = relative(dir, taskPath);
  const document = readMarkdown(taskPath, path, faults, true);
  const options = validateData(document.data, path, faults);
  return {
    extension,
    options,
    request: { body: document.body, via: "task" },
  };
}

function parseSplitInvocation(split: SplitInvocation, dir: string, env: NodeJS.ProcessEnv, faults: Refusal[]): Invocation {
  const commandOptions = extractCommandOptions(split.rawOptions, split.valueless, faults);
  const request = readRequest(split.requests[0], dir, faults);
  const supplied = new Map(split.rawOptions);
  const home = resolveHome(dir, split.valueless.has("home") ? undefined : split.rawOptions.get("home"), env);
  supplied.delete("home");
  const workdir = split.valueless.has("in") ? undefined : split.rawOptions.get("in");
  supplied.delete("in");
  // A key still in `supplied` is one this rung does not know — an unknown option
  // or a declared slot — and only the assembly settles which, so it waits for
  // check.ts. Every other valueless key is one bot has, and wants its value.
  for (const name of split.valueless) {
    if (!supplied.has(name) && !RETIRED_MODEL_OPTIONS.some((retired) => retired === name)) {
      fault(faults, "request-invalid", `--${name}`, `Supply a value for --${name}.`);
    }
  }
  return {
    target: split.target,
    valueless: split.valueless,
    requestExtension: request.extension,
    taskOptions: request.options,
    commandOptions,
    supplied,
    home,
    ...(workdir === undefined ? {} : { workdir }),
    ...(request.request === undefined ? {} : { request: request.request }),
    faults,
  };
}

export function parseInvocationTokens(tokens: string[], dir: string, env: NodeJS.ProcessEnv): Invocation {
  const faults: Refusal[] = [];
  return parseSplitInvocation(splitInvocation(tokens, faults), dir, env, faults);
}

export function parseRunInvocationTokens(tokens: string[], dir: string, env: NodeJS.ProcessEnv): Invocation {
  const faults: Refusal[] = [];
  return parseSplitInvocation(splitRunInvocation(tokens, faults), dir, env, faults);
}

export function parseInvocation(source: string, dir: string, env: NodeJS.ProcessEnv): Invocation {
  return parseInvocationTokens(words(source), dir, env);
}

function explicitTarget(target: string): boolean {
  return isAbsolute(target) || /^\.\.?(?:\/|$)/u.test(target);
}

// The one place a reference is normalized, before anything classifies it
// (ticket 0163). A path spelling is settled against the working directory
// here, so every spelling of one directory is the same reading: `.` used to
// miss the path test entirely and go looking for an assembly of that name in
// the home, and a trailing slash — `./`, `./good/`, `"$PWD"/` — split into a
// flow named nothing and refused as two readings. A lone `/` keeps its slash,
// being the root rather than a separator, and a name stays the name typed.
function normalizeTarget(target: string, dir: string): string {
  const held = target.replace(/(?<=.)\/+$/u, "");
  return explicitTarget(held) ? resolve(dir, held) : held;
}

interface TargetParts {
  base: string;
  parent: string;
  flow?: string;
}

function targetPath(explicit: boolean, invocation: Invocation, dir: string, target: string): string {
  return explicit ? resolve(dir, target) : join(invocation.home, "assemblies", target);
}

function targetParts(invocation: Invocation, dir: string, whole: string): TargetParts {
  const explicit = explicitTarget(whole);
  const slash = whole.lastIndexOf("/");
  const parentTarget = slash < 0 ? "" : whole.slice(0, slash);
  const flow = slash < 0 ? undefined : whole.slice(slash + 1);
  return {
    base: targetPath(explicit, invocation, dir, whole),
    parent: targetPath(explicit, invocation, dir, parentTarget),
    ...(flow === undefined ? {} : { flow }),
  };
}

/** Something stands at what was named and is not an assembly: the reader's fault reading a path, and `install`'s reading a source (0137). */
export const NOT_ONE = "Name an assembly; what is there is not one.";

export function resolveTarget(invocation: Invocation, dir: string): Target {
  const faults: Refusal[] = [];
  const whole = normalizeTarget(invocation.target, dir);
  const parts = targetParts(invocation, dir, whole);
  const wholeIsAssembly = assemblyMarker(parts.base);
  const parentIsAssembly = parts.flow === undefined ? false : assemblyMarker(parts.parent);
  if (wholeIsAssembly) {
    if (parentIsAssembly) {
      fault(faults, "request-invalid", invocation.target, "Name only one assembly reading.");
      return { faults };
    }
    return { assemblyRoot: parts.base, faults };
  }
  if (parentIsAssembly) return { assemblyRoot: parts.parent, ...(parts.flow === undefined ? {} : { flow: parts.flow }), faults };
  // Something stands where the assembly would — a link whose target is gone or
  // was never one, a path that is not one — and it is listed, counted and
  // removable, so "name an assembly that exists" lied about it (ticket 0130).
  const stands = lstatExists(parts.base) || (parts.flow !== undefined && !explicitTarget(whole) && lstatExists(parts.parent));
  fault(faults, "assembly-unknown", invocation.target, stands ? NOT_ONE : "Name an assembly that exists.");
  return { faults };
}

export function readHome(invocation: Invocation, dir: string): HomeConfig {
  const config = join(invocation.home, "config.yaml");
  if (!lstatExists(config)) return { options: {}, intelligences: {} };
  return readYamlOptions(config, relative(dir, config), invocation.faults);
}

export function validateInvocationPaths(invocation: Invocation, dir: string): void {
  if (invocation.workdir !== undefined) {
    const path = resolve(dir, invocation.workdir);
    if (!lstatExists(path) || !lstatSync(path).isDirectory()) {
      fault(invocation.faults, "path-missing", invocation.workdir, "Name an existing working directory.");
    }
  }
}
