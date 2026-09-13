// The lens that reads (inspection.md): what a HOME holds — its runs and how each
// ended, its assemblies, its size on disk, and which runs may be pruned. Turning
// a run directory into record lines is record-lines.ts, the lines computed from
// those events rather than held in them are readings.ts, and the verbs that name
// one run are one-run.ts; what is left here is the walking of the home, a run's
// liveness, and the listing each verb prints (tickets 0099, 0134).
import { type Dirent } from "node:fs";
import { lstat, opendir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { checkSync, lockSync } from "proper-lockfile";
import { assemblyMarker, entries, lstatExists } from "./documents.ts";
import { bytewise, errorCode, plainly, visible } from "./model.ts";
import type { Usage } from "./readings.ts";
import { runStateFact, type RunStateFact } from "./run-state.ts";
import { CAPTURE } from "./record.ts";
import { jsonObject } from "./check.ts";
import { field, heldRecord } from "./record-lines.ts";
import { byteMagnitude, compactMagnitude, elapsedAge, renderRows, renderTable } from "./table.ts";

export interface InspectionResult {
  exitCode: 0 | 1;
  output: Buffer;
  cause?: string;
  /** What could not be read, for stderr ("Diagnostics go to stderr", inspection.md). */
  diagnostics?: string[];
}

export function output(lines: string[]): Buffer {
  return Buffer.from(lines.length === 0 ? "" : `${lines.join("\n")}\n`);
}

export function result(lines: string[]): InspectionResult {
  return { exitCode: lines.length === 0 ? 1 : 0, output: output(lines) };
}

// Nothing found is an answer and says which nothing: the sentence goes to
// stderr beside the empty stdout, never instead of it, and the exit code stays
// the found/not-found answer ("Diagnostics go to stderr", inspection.md).
export const nothing = (says: string, cause?: string): InspectionResult => ({ exitCode: 1, output: output([]), diagnostics: [says], ...(cause === undefined ? {} : { cause }) });

/** The one sentence for a home that is not there; every path says it (0136). */
export const noHome = (home: string): string => `There is no bot home at ${home}.`;

/** A home that is not there, and one holding none of what was asked for — the
 *  two ways a listing comes back empty. `bot assembly` says it from cli.ts. */
export const holdsNone = (home: string, held: string): string =>
  lstatExists(home) ? `This home has no ${held}.` : noHome(home);

export interface Held { name: string; path: string; linked: boolean }

// A link at the name is one entry and is never descended into: what it resolves
// to is an assembly the reader judges, not a folder this walk explores.
function walkAssemblies(assemblies: string, prefix: string, found: Held[]): void {
  for (const entry of entries(join(assemblies, prefix))) {
    const name = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    const path = join(assemblies, ...name.split("/"));
    if (entry.isSymbolicLink()) found.push({ name, path, linked: true });
    else if (!entry.isDirectory()) continue;
    else if (assemblyMarker(path)) found.push({ name, path, linked: false });
    else walkAssemblies(assemblies, name, found);
  }
}

/** What the home holds under `assemblies/`, in name order. The tree IS the
 *  registry (home.md), so this is the one walk of it: `bot assembly list`
 *  renders these entries and `bot status` counts them. It reads, so it lives
 *  in the lens that reads — management writes, and already imports from here. */
export function heldAssemblies(home: string): Held[] {
  const found: Held[] = [];
  walkAssemblies(join(home, "assemblies"), "", found);
  return found;
}

// A run is alive while it holds its lock (runtime.md): the runtime refreshes
// the lock's mtime as it works, so a crashed process goes stale within seconds
// and the run reads as crashed. The lock is proper-lockfile's default sibling
// `<run>.lock` — outside the run directory, whose contents the record
// specifies (record.md, "What is kept beside it") — so it is filtered here.
export const RUN_LOCK = { realpath: false, stale: 10_000 };

export function lockRun(directory: string): () => void {
  return lockSync(directory, RUN_LOCK);
}

/** Whether a donor is still owned by a live process. */
export function isRunLive(directory: string): boolean {
  return checkSync(directory, RUN_LOCK);
}

export async function runNames(home: string): Promise<string[]> {
  const runs = join(home, "runs");
  if (!lstatExists(runs)) return [];
  const entries = await readdir(runs, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && !entry.name.endsWith(".lock")).map((entry) => entry.name).sort(bytewise);
}

// How a run ended, or that it has not (inspection.md, `bot runs`): with no
// `run_end` it reads `running` while its lock is live and `crashed` once the
// lock is stale. One place decides it, because management refuses to touch what
// a `running` run holds and the listing must never disagree with the refusal.
function ending(events: Record<string, unknown>[], directory: string): string {
  let end: Record<string, unknown> | undefined;
  for (const event of events) if (event["event"] === "run_end") end = event;
  if (end !== undefined) return `${field(end, "exit")}/${field(end, "cause")}`;
  return checkSync(directory, RUN_LOCK) ? "running" : "crashed";
}

interface RunReading { id: string; assembly: string | null; flow: string | null; startedAt: string | null; state: string; tokens: number | null; usage?: Usage[] }

interface RunsQuery { all: boolean; usage?: boolean; assembly?: string; flow?: string; state?: string; since?: string; limit?: number; prefix?: string }
interface RunsDocument { schemaVersion: 1; runs: RunReading[] }
// How many runs a bare reading covers. Twenty keeps a naive reading out of an
// agent's context window (0142), while a home pruned at the default thirty
// still tells its reader that older runs were left out. It counts runs, never
// output rows, so a reading never cuts one run in half.
export const RUNS_BOUND = 20;

/** One state precedence serves every run listing. A live recordless directory is still being born and has no fact yet. */
export async function readRunState(home: string, id: string, withTokens = true, withUsage = false): Promise<RunStateFact | undefined> {
  const directory = join(home, "runs", id);
  const record = await heldRecord(directory);
  return runStateFact(id, record, checkSync(directory, RUN_LOCK), withTokens, withUsage);
}

function runsLines(runs: RunReading[], readingAt?: string): string[] {
  return renderTable([
    { label: "run id" },
    { label: "assembly" },
    { label: "flow" },
    { label: "started", align: "right" },
    { label: "outcome" },
    { label: "tokens", align: "right" },
  ], runs.map((run) => [
    run.id,
    run.assembly ?? "-",
    run.flow ?? "-",
    run.startedAt === null ? "-" : readingAt === undefined ? run.startedAt : elapsedAge(run.startedAt, readingAt),
    run.state,
    run.tokens === null ? "-" : compactMagnitude(run.tokens),
  ]));
}

interface HeldRun { run: RunReading; says?: string }

async function readRun(home: string, id: string, withUsage = false): Promise<HeldRun | undefined> {
  const fact = await readRunState(home, id, true, withUsage);
  if (fact === undefined) return undefined;
  const state = fact.legacyState === "ended" ? `${String(fact.exit)}/${String(fact.cause)}` : fact.legacyState;
  return {
    run: {
      id: fact.id, assembly: fact.assembly, flow: fact.flow, startedAt: fact.startedAt, state, tokens: fact.tokens,
      ...(fact.usage === undefined ? {} : { usage: fact.usage }),
    },
    ...(fact.says === undefined ? {} : { says: fact.says }),
  };
}

function matchesRun(run: RunReading, query: RunsQuery): boolean {
  return (query.assembly === undefined || run.assembly === query.assembly) && (query.flow === undefined || run.flow === query.flow) && (query.state === undefined || run.state === query.state) && (query.since === undefined || (run.startedAt !== null && Date.parse(run.startedAt) >= Date.parse(query.since)));
}

function runsDiagnostics(home: string, query: RunsQuery, names: string[], shown: string[], held: HeldRun[], runs: RunReading[]): string[] {
  const filtered = query.assembly !== undefined || query.flow !== undefined || query.state !== undefined || query.since !== undefined || query.limit !== undefined;
  return [
    ...(runs.length === 0 ? [filtered ? "No run matches." : holdsNone(home, "runs")] : []),
    ...held.flatMap(({ says }) => says ?? []),
    ...(query.prefix === undefined && shown.length < names.length ? [`Showing the newest ${String(shown.length)} runs of ${String(names.length)}; --all shows every run.`] : []),
  ];
}

function shownRuns(names: string[], query: RunsQuery): string[] | InspectionResult {
  const prefix = query.prefix;
  if (prefix === undefined) return query.all ? names : names.slice(-RUNS_BOUND);
  const matches = names.filter((name) => name.startsWith(prefix));
  return matches.length === 1 ? matches : nothing(matches.length === 0 ? `No run's name starts with ${prefix}.` : `${String(matches.length)} runs start with ${prefix}; give more of the name.`);
}

function limitedRuns(held: HeldRun[], query: RunsQuery): HeldRun[] {
  const matched = held.filter(({ run }) => matchesRun(run, query)); return query.limit === undefined ? matched : matched.slice().reverse().slice(0, query.limit).reverse();
}

// One gathered reading serves both renderings, so a machine reader cannot see
// a different home from the person reading the table.
// Keep the public reader's former `(home, json)` call shape while the CLI
// supplies `(home, query, json)` for bounded queries.
export async function inspectRuns(home: string, queryOrJson: RunsQuery | boolean = { all: false }, json = false, readingAt?: string): Promise<InspectionResult> {
  const query = typeof queryOrJson === "boolean" ? { all: false } : queryOrJson;
  const machine = typeof queryOrJson === "boolean" ? queryOrJson : json;
  const names = await runNames(home);
  if (!lstatExists(home)) return nothing(noHome(home));
  const shown = shownRuns(names, query);
  if (!Array.isArray(shown)) return shown;
  const held = (await Promise.all(shown.map((id) => readRun(home, id, query.usage)))).flatMap((one) => one === undefined ? [] : [one]);
  const runs = limitedRuns(held, query).map(({ run }) => run);
  const document: RunsDocument = { schemaVersion: 1, runs };
  return {
    exitCode: runs.length === 0 ? 1 : 0,
    output: output(machine ? [jsonObject(document)] : runs.length === 0 ? [] : runsLines(runs, readingAt)),
    diagnostics: runsDiagnostics(home, query, names, shown, held, runs),
  };
}

/** The assemblies a live run is still using — what `update` and `remove` refuse
 *  to touch (management.md). `undefined` is the answer no name can carry: a live
 *  run whose record is missing or unreadable leaves no tree provably idle — a
 *  name from a dialect this cannot read would be made up. A dead run blocks nothing. */
export async function liveAssemblies(home: string): Promise<Set<string> | undefined> {
  const held = await Promise.all((await runNames(home)).map(async (name) => {
    const directory = join(home, "runs", name);
    const record = await heldRecord(directory);
    if (record === undefined || record.fault !== undefined) return checkSync(directory, RUN_LOCK) ? null : undefined;
    const start = record.events.find((event) => event["event"] === "run_start") ?? {};
    if (ending(record.events, directory) !== "running") return undefined;
    return typeof start["assembly"] === "string" && start["assembly"].length > 0 ? start["assembly"] : null;
  }));
  return held.includes(null) ? undefined : new Set(held.filter((name) => typeof name === "string"));
}

// A link weighs the link, never its target: `remove` "never removes what a link
// pointed at" (management.md), so the tree is not the home's to count — and a
// broken link is a named state, which `lstat` weighs and `stat`, following, dies on.
function zeroWhenUnavailable<T>(reason: unknown, zero: T): T {
  const code = errorCode(reason);
  if (code === "ENOENT" || code === "EACCES") return zero;
  throw reason;
}

export async function directorySize(directory: string): Promise<number> {
  let bytes = 0;
  const listed = await readdir(directory, { withFileTypes: true }).then(
    (entries) => entries,
    (reason: unknown) => zeroWhenUnavailable(reason, []),
  );
  for (const entry of listed) {
    const path = join(directory, entry.name);
    bytes += entry.isDirectory()
      ? await directorySize(path)
      : await lstat(path).then(({ size }) => size, (reason: unknown) => zeroWhenUnavailable(reason, 0));
  }
  return bytes;
}

interface StatusSize { bytes: number; copyBytes: number }
interface StatusGuard { exhausted: boolean }
interface StatusPath { directory: string; depth: number; inCapture: boolean }
interface StrandedTree { hidden: string; path: string; of: string; install: boolean }

const STATUS_MAX_DEPTH = 32;
const STATUS_MAX_ENTRIES = 1_000;

// The iterator avoids materializing a hostile directory. Each directory has
// its own width guard, while the direct children of `runs/` are retained
// records rather than hostile entries.
async function statusEntries(directory: string, depth: number, guard: StatusGuard, allowWide = false): Promise<Dirent[]> {
  const held = await opendir(directory).then(
    (opened) => opened,
    (reason: unknown) => { zeroWhenUnavailable(reason, undefined); },
  );
  if (held === undefined) return [];
  const entries: Dirent[] = [];
  for await (const entry of held) {
    if (depth >= STATUS_MAX_DEPTH || (!allowWide && entries.length >= STATUS_MAX_ENTRIES)) {
      guard.exhausted = true;
      break;
    }
    entries.push(entry);
  }
  return entries;
}

async function statusSize(directory: string, captures: Set<string>, guard: StatusGuard, runs?: string, inCapture = false, depth = 0): Promise<StatusSize> {
  let bytes = 0;
  let copyBytes = 0;
  const paths: StatusPath[] = [{ directory, depth, inCapture }];
  while (paths.length > 0 && !guard.exhausted) {
    const current = paths.pop();
    if (current === undefined) continue;
    for (const entry of await statusEntries(current.directory, current.depth, guard, current.directory === runs)) {
      const path = join(current.directory, entry.name);
      const captured = current.inCapture || captures.has(path);
      if (entry.isDirectory()) {
        paths.push({ directory: path, depth: current.depth + 1, inCapture: captured });
      } else {
        const size = await lstat(path).then(({ size }) => size, (reason: unknown) => zeroWhenUnavailable(reason, 0));
        bytes += size;
        if (captured) copyBytes += size;
      }
    }
  }
  return { bytes, copyBytes };
}

async function statusRunNames(home: string, guard: StatusGuard): Promise<string[]> {
  const runs = join(home, "runs");
  if (!lstatExists(runs)) return [];
  return (await statusEntries(runs, 1, guard, true))
    .filter((entry) => entry.isDirectory() && !entry.name.endsWith(".lock"))
    .map((entry) => entry.name).sort(bytewise);
}

function holdAssembly(assemblies: string, prefix: string, depth: number, entry: Dirent, found: Held[], paths: { prefix: string; depth: number }[]): void {
  if (!visible(entry.name)) return;
  const name = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
  const path = join(assemblies, ...name.split("/"));
  if (entry.isSymbolicLink()) { found.push({ name, path, linked: true }); return; }
  if (!entry.isDirectory()) return;
  if (assemblyMarker(path)) { found.push({ name, path, linked: false }); return; }
  paths.push({ prefix: name, depth: depth + 1 });
}

async function statusAssemblies(home: string, guard: StatusGuard): Promise<Held[]> {
  const assemblies = join(home, "assemblies");
  const found: Held[] = [];
  const paths: { prefix: string; depth: number }[] = [{ prefix: "", depth: 1 }];
  while (paths.length > 0 && !guard.exhausted) {
    const current = paths.pop();
    if (current === undefined) continue;
    for (const entry of await statusEntries(join(assemblies, current.prefix), current.depth, guard)) {
      holdAssembly(assemblies, current.prefix, current.depth, entry, found, paths);
    }
  }
  return found;
}

// `bot assembly` stages hidden installs and updates. Status reads all entries,
// but stops at an assembly so its own hidden names stay its business.
const STRANDED = /^(?:\.bot-(?:old|update)-(?<update>.+)|\.bot-install-(?<install>.+)-[a-z\d]{6})$/iu;

function holdStrandedTree(assemblies: string, prefix: string, depth: number, entry: Dirent, found: StrandedTree[], paths: { prefix: string; depth: number }[]): void {
  if (!entry.isDirectory()) return;
  const hidden = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
  const path = join(assemblies, ...hidden.split("/"));
  const install = entry.name.startsWith(".bot-install-");
  const of = STRANDED.exec(entry.name)?.groups?.[install ? "install" : "update"];
  if (of !== undefined) { found.push({ hidden, path, of: prefix.length === 0 ? of : `${prefix}/${of}`, install }); return; }
  if (!assemblyMarker(path)) paths.push({ prefix: hidden, depth: depth + 1 });
}

async function statusStrandedTrees(home: string, guard: StatusGuard): Promise<StrandedTree[]> {
  const assemblies = join(home, "assemblies");
  const found: StrandedTree[] = [];
  const paths: { prefix: string; depth: number }[] = [{ prefix: "", depth: 1 }];
  while (paths.length > 0 && !guard.exhausted) {
    const current = paths.pop();
    if (current === undefined) continue;
    for (const entry of await statusEntries(join(assemblies, current.prefix), current.depth, guard)) {
      holdStrandedTree(assemblies, current.prefix, current.depth, entry, found, paths);
    }
  }
  return found.sort((first, second) => bytewise(first.hidden, second.hidden));
}

interface StrandedReading { name: string; bytes: number; assembly: string; installed: boolean }

interface StatusDocument {
  schemaVersion: 1;
  assemblies: number;
  runs: number;
  bytes: number;
  copyBytes: number;
  oldest: string | null;
  newest: string | null;
  stranded: StrandedReading[];
}

// One gathered stranded tree serves both renderings. Whether the assembly is
// standing is the whole of what a person does next: with it gone, the copies
// beside it are the only ones there are.
async function statusStrandedReadings(home: string, guard: StatusGuard): Promise<StrandedReading[]> {
  const assemblies = join(home, "assemblies");
  const readings: StrandedReading[] = [];
  for (const one of await statusStrandedTrees(home, guard)) {
    const size = await statusSize(one.path, new Set<string>(), guard);
    if (guard.exhausted) return [];
    readings.push({
      name: one.hidden,
      bytes: size.bytes,
      assembly: one.of,
      installed: !one.install && lstatExists(join(assemblies, ...one.of.split("/"))),
    });
  }
  return readings;
}

function statusLines(status: StatusDocument): string[] {
  const summary = renderRows([{ label: "fact" }, { label: "value", align: "right" }], [
    ["assemblies", String(status.assemblies)], ["runs", String(status.runs)],
    ["bytes", byteMagnitude(status.bytes)], ["copy-bytes", byteMagnitude(status.copyBytes)],
    ["oldest", status.oldest ?? "-"],
    ["newest", status.newest ?? "-"],
  ]);
  return [
    ...summary,
    ...status.stranded.map((one) => {
      const install = one.name.split("/").at(-1)?.startsWith(".bot-install-");
      return plainly(`${one.name}  ${byteMagnitude(one.bytes)}  a copy of ${one.assembly} made by an ${install ? "install" : "update"}${one.installed ? "" : `; ${one.assembly} is not installed`}`);
    }),
  ];
}

const statusExhausted = (guard: StatusGuard): boolean => guard.exhausted;

export async function inspectStatus(home: string, json = false): Promise<InspectionResult> {
  if (!lstatExists(home)) return nothing(noHome(home));
  const guard: StatusGuard = { exhausted: false };
  const names = await statusRunNames(home, guard);
  if (statusExhausted(guard)) return nothing("This bot home is too large to inspect.");
  // What the runs' own copies of the assembly hold (record.md): part of the
  // total beside it, said apart because nothing bounds it but `bot prune`.
  // LOGICAL bytes — `lstat` sums what it reports. What the copies HOLD, never
  // what the disk lost, which is why no word printed here says disk.
  const captures = new Set(names.map((name) => join(home, "runs", name, CAPTURE)));
  const size = await statusSize(home, captures, guard, join(home, "runs"));
  if (statusExhausted(guard)) return nothing("This bot home is too large to inspect.");
  const assemblies = await statusAssemblies(home, guard);
  if (statusExhausted(guard)) return nothing("This bot home is too large to inspect.");
  const stranded = await statusStrandedReadings(home, guard);
  if (statusExhausted(guard)) return nothing("This bot home is too large to inspect.");
  const document: StatusDocument = {
    schemaVersion: 1,
    assemblies: assemblies.length,
    runs: names.length,
    bytes: size.bytes,
    copyBytes: size.copyBytes,
    oldest: names[0] ?? null,
    newest: names.at(-1) ?? null,
    stranded,
  };
  return result(json ? [jsonObject(document)] : statusLines(document));
}
