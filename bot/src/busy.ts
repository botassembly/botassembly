// The quiet `busy` probe walks every run record because a live child can outlast
// the top-level run that started it. A failure to bound that walk is busy: the
// caller cannot safely act on a directory whose live owner it could not find.
import type { Dirent } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { check } from "proper-lockfile";
import { errorCode, mapping } from "./model.ts";
import { groupEvidence } from "./process-group-evidence.ts";
import { heldRecord } from "./record-lines.ts";
import { normalizedWorkdir } from "./record-operation.ts";
import { RUN_LOCK } from "./inspection.ts";

type Identity = string;

function identity(event: Record<string, unknown>): Identity | undefined {
  const stage = event["stage"], retry = event["retry"], repeat = event["repeat"];
  if (typeof stage !== "string" || !positiveInteger(retry) || (repeat !== undefined && !positiveInteger(repeat))) return undefined;
  return `${stage}:${String(repeat ?? "")}:${String(retry)}`;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function runRoot(events: Record<string, unknown>[]): string | undefined {
  const root = events.find((event) => event["event"] === "run_start")?.["workdir"];
  return typeof root === "string" && isAbsolute(root) ? resolve(root) : undefined;
}

type StageState = { kind: "other" } | { kind: "invalid" } | { kind: "start"; identity: Identity; directory: string } | { kind: "end"; identity: Identity };

function stageState(event: Record<string, unknown>, root: string): StageState {
  if (event["event"] === "stage_end") {
    const held = identity(event);
    return held === undefined ? { kind: "invalid" } : { kind: "end", identity: held };
  }
  if (event["event"] !== "stage_start") return { kind: "other" };
  const held = identity(event), workdir = event["workdir"];
  if (held === undefined || !mapping(workdir) || typeof workdir["resolved"] !== "string" || !normalizedWorkdir(workdir["resolved"])) return { kind: "invalid" };
  const directory = resolve(root, workdir["resolved"]);
  return directory === root || directory.startsWith(`${root}${sep}`) ? { kind: "start", identity: held, directory } : { kind: "invalid" };
}

function activeDirectories(events: Record<string, unknown>[]): string[] | undefined {
  const root = runRoot(events);
  if (root === undefined) return undefined;
  const active = new Map<Identity, string>();
  for (const event of events) {
    const state = stageState(event, root);
    if (state.kind === "invalid") return undefined;
    if (state.kind === "start") active.set(state.identity, state.directory);
    if (state.kind === "end") active.delete(state.identity);
  }
  return [root, ...active.values()];
}

function childRuns(directory: string): Promise<string[]> {
  const stages = join(directory, "stages");
  return lstat(stages).then(
    (held) => held.isDirectory() ? readdir(stages, { withFileTypes: true }).then((entries) => childRunsIn(stages, entries)) : rejected(new Error(`Invalid child tree: ${stages}`)),
    (reason: unknown) => errorCode(reason) === "ENOENT" ? [] : rejected(reason),
  );
}

function childRunsIn(directory: string, entries: Dirent[]): Promise<string[]> {
  return Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.name === "subflows") return entry.isDirectory()
      ? readdir(path, { withFileTypes: true }).then((children) => children.every((child) => child.isDirectory())
        ? children.map((child) => join(path, child.name))
        : Promise.reject(new Error(`Invalid subflow directory: ${path}`)))
      : Promise.reject(new Error(`Invalid subflow directory: ${path}`));
    if (entry.isSymbolicLink()) return Promise.reject(new Error(`Invalid child tree entry: ${path}`));
    return entry.isDirectory() ? readdir(path, { withFileTypes: true }).then((children) => childRunsIn(path, children)) : Promise.resolve([]);
  })).then((found) => found.flat());
}

async function locallyBusy(directory: string, target: string): Promise<boolean> {
  const [live, evidence] = await Promise.all([check(directory, RUN_LOCK), groupEvidence(directory)]);
  // A reservation is evidence too. Its PID is deliberately not parseable until
  // spawn publishes it, so a SIGKILL cannot turn a just-started group into idle.
  if (evidence === "invalid") return true;
  const record = await heldRecord(directory);
  if (record?.fault !== undefined) return live || evidence === "live";
  if (record === undefined) return evidence === "live";
  const directories = activeDirectories(record.events);
  if (directories === undefined) return live || evidence === "live";
  return (live || evidence === "live") && directories.includes(target);
}

function runBusy(directory: string, target: string): Promise<boolean> {
  return childRuns(directory).then((children) => Promise.all(children.map((child) => runBusy(child, target))).then(
    (childrenBusy) => childrenBusy.includes(true) ? true : locallyBusy(directory, target),
  ));
}

function rejected(reason: unknown): Promise<never> {
  return Promise.reject(reason instanceof Error ? reason : new Error("Run tree reading failed.", { cause: reason }));
}

function topLevelRuns(home: string): Promise<string[]> {
  const runs = join(home, "runs");
  return readdir(runs, { withFileTypes: true }).then(
    (entries) => entries.filter((entry) => {
      if (entry.name.endsWith(".lock")) return false;
      if (entry.isSymbolicLink()) throw new Error(`Invalid run entry: ${join(runs, entry.name)}`);
      return entry.isDirectory();
    }).map((entry) => join(runs, entry.name)),
    (reason: unknown) => errorCode(reason) === "ENOENT" ? [] : rejected(reason),
  );
}

/** Whether any live run can own the caller-resolved directory. */
export function isBusy(home: string, directory: string): Promise<boolean> {
  return topLevelRuns(home).then((runs) => Promise.all(runs.map((run) => runBusy(run, directory))).then((found) => found.includes(true))).then(
    (busy) => busy,
    // This reading is an action guard: an unbounded run tree means busy.
    () => true,
  );
}
