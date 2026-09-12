import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { jsonObject } from "./check.ts";
import { inertText } from "./new-command-result.ts";
import { bytewise } from "./model.ts";
import { isRunLive } from "./inspection.ts";
import { attemptKey, scratchAttempt, scratchOfRun } from "./invocation.ts";
import { heldRecord } from "./record-lines.ts";
import { CAUSES } from "./spine.ts";
import type { CliFailure } from "./run-list-query.ts";

const RUN_SHOW_DOCUMENT_BYTES = 1_048_576;
const RUN_SHOW_ROW_LIMIT = 1_000;
const TEXT_BYTES = 4_096;
const WARNING_LIMIT = 20;
const causes = new Set<string>(CAUSES);
type Event = Record<string, unknown>;
type Warning = { code: string; subject: string; field: string; omittedBytes: number };
type StageRow = { identity: string; stage: string; repeat: number | null; attempt: number; state: string; exit: number | null; cause: string | null; scratch: string | null };
type SubflowRow = { caller: string; attempt: number; call: number; subflow: string; item: string | null; started: boolean; child: string | null; exit: number | null; cause: string | null };
type OrderedRow = { order: number; type: "stage"; row: StageRow; sourceWarnings: Warning[] } | { order: number; type: "subflow"; row: SubflowRow; sourceWarnings: Warning[] };
interface RootData { run: string; state: string; startedAt: string | null; endedAt: string | null; exit: number | null; cause: string | null; stages: StageRow[]; subflows: SubflowRow[] }
interface RootModel { data: RootData; sourceWarnings: Warning[] }
export interface RunShowDependencies {
  documentBytes?: number;
  live?: (directory: string) => boolean;
  scratch?: (path: string) => boolean | Promise<boolean>;
}

class ReadingFailure extends Error {
  readonly failure: CliFailure;
  constructor(failure: CliFailure) { super(failure.message); this.failure = failure; }
}
const failure = (code: CliFailure["code"], cause: string, message: string, exit: CliFailure["exit"], details: Record<string, unknown> = {}): ReadingFailure =>
  new ReadingFailure({ code, cause, message, retryable: false, details, exit });
const integrity = (cause: string, message: string): ReadingFailure => failure("integrity-failed", cause, message, 5);
const dependency = (cause: string, message: string): ReadingFailure => failure("dependency-failed", cause, message, 4);
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw integrity("record-invalid", `The selected record has an invalid ${field}.`);
  if (Buffer.byteLength(value) > TEXT_BYTES) throw integrity("text-too-large", `The selected record has an oversized ${field}.`);
  return value;
}
const warningSubject = (value: string, context: "stage" | "subflow"): string => required(value, `${context} warning subject`);

function optional(value: unknown, subject: string, field: string, warnings: Warning[]): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") throw integrity("record-invalid", `The selected record has an invalid ${field}.`);
  const bytes = Buffer.byteLength(value);
  if (bytes <= TEXT_BYTES) return value;
  warnings.push({ code: "text-unavailable", subject, field, omittedBytes: bytes - TEXT_BYTES });
  return null;
}

function pair(event: Event, context: string): { exit: number; cause: string } | undefined {
  const exit = event["exit"], cause = event["cause"];
  if (exit === undefined && cause === undefined) return undefined;
  return checkedPair(exit, cause, context);
}

function checkedPair(exit: unknown, cause: unknown, context: string): { exit: number; cause: string } {
  if (typeof exit !== "number" || !Number.isSafeInteger(exit) || exit < 0 || typeof cause !== "string" || !causes.has(cause)) {
    throw integrity("record-invalid", `The selected record has an invalid ${context} outcome.`);
  }
  const fixed = new Map<string, readonly number[]>([["success", [0]], ["fault", [2]], ["timeout", [1, 2]], ["signal", [129, 130, 143]]]);
  const valid = (fixed.get(cause) ?? [1]).includes(exit);
  if (!valid) throw integrity("record-invalid", `The selected record has an invalid ${context} outcome.`);
  return { exit, cause };
}

const keyOf = (stage: string, repeat: number | null, attempt: number): string => `${stage}\0${String(repeat ?? 1)}\0${String(attempt)}`;
const identityOf = (stage: string, repeat: number | null): string => repeat === null ? stage : `${stage}#${String(repeat)}`;

async function scratchPath(root: string, home: string, run: string, stage: string, repeat: number | null, inspect?: RunShowDependencies["scratch"]): Promise<string | null> {
  const path = scratchAttempt(scratchOfRun(root, home, run), attemptKey(stage, repeat ?? undefined));
  const observed = inspect === undefined ? lstat(path).then(() => true) : Promise.resolve().then(() => inspect(path));
  return observed.then((exists) => exists ? path : null, (reason: unknown) => {
    if (typeof reason === "object" && reason !== null && Reflect.get(reason, "code") === "ENOENT") return null;
    throw dependency("scratch-unavailable", "Run show could not inspect stage scratch.");
  });
}

interface StageFacts { rows: OrderedRow[]; attempts: Map<string, OrderedRow>; ends: Map<string, { exit: number; cause: string }>; unreconciled: Set<string> }
function repeatOf(event: Event, context: string): number | null {
  const repeat = event["repeat"];
  if (repeat === undefined) return null;
  if (!positive(repeat)) throw integrity("record-invalid", `The selected record has an invalid ${context} repeat.`);
  return repeat;
}
function stageIdentity(event: Event): { stage: string; repeat: number | null; attempt: number; key: string } {
  const stage = required(event["stage"], "stage name"), repeat = repeatOf(event, "stage"), attempt = event["retry"];
  if (!positive(attempt)) throw integrity("record-invalid", "The selected record has an invalid stage attempt.");
  return { stage, repeat, attempt, key: keyOf(stage, repeat, attempt) };
}
function consumeStage(facts: StageFacts, event: Event, order: number): void {
  const name = event["event"];
  if (!["stage_carried", "stage_start", "stage_end", "unreconciled"].includes(String(name))) return;
  const held = stageIdentity(event);
  if (name === "stage_end") { facts.ends.set(held.key, checkedPair(event["exit"], event["cause"], "stage")); return; }
  if (name === "unreconciled") { facts.unreconciled.add(held.key); return; }
  const prior = facts.attempts.get(held.key);
  if (prior !== undefined) { if (name === "stage_carried" && prior.type === "stage") prior.row.state = "carried"; return; }
  const row: OrderedRow = { order, type: "stage", row: { identity: required(identityOf(held.stage, held.repeat), "stage identity"), stage: held.stage, repeat: held.repeat, attempt: held.attempt, state: name === "stage_carried" ? "carried" : "incomplete", exit: null, cause: null, scratch: null }, sourceWarnings: [] };
  facts.attempts.set(held.key, row); facts.rows.push(row);
}
function stageFacts(events: Event[]): StageFacts {
  const facts: StageFacts = { rows: [], attempts: new Map(), ends: new Map(), unreconciled: new Set() };
  for (const [order, event] of events.entries()) consumeStage(facts, event, order);
  return facts;
}

function subflowOrigin(event: Event, subject: string, warnings: Warning[]): string | null {
  if (event["via"] === undefined && event["item"] === undefined) return null;
  if (event["via"] !== "fanout" || typeof event["item"] !== "string") throw integrity("record-invalid", "The selected record has an invalid subflow origin.");
  return optional(event["item"], subject, "item", warnings);
}
function subflowCounters(event: Event): { repeat: number | null; attempt: number; call: number } {
  const repeat = repeatOf(event, "subflow"), attempt = event["retry"], call = event["call"];
  if (!positive(attempt) || !positive(call)) throw integrity("record-invalid", "The selected record has an invalid subflow counter.");
  return { repeat, attempt, call };
}
function subflowCompletion(event: Event, started: boolean, child: string): { exit: number; cause: string } | undefined {
  const outcome = pair(event, "subflow");
  if (!started && (event["child"] !== undefined || outcome !== undefined)) throw integrity("record-invalid", "The selected record has facts for a subflow that did not start.");
  if (started && event["child"] !== child) throw integrity("record-invalid", "The selected record has an invalid child path.");
  return outcome;
}
function subflowRow(event: Event, order: number): OrderedRow {
  const stage = required(event["stage"], "subflow caller"), { repeat, attempt, call } = subflowCounters(event);
  const caller = required(identityOf(stage, repeat), "subflow caller identity"), subject = warningSubject(`${caller}/${String(attempt)}:call/${String(call)}`, "subflow"), subflow = required(event["flow"], "subflow name"), started = event["started"];
  if (typeof started !== "boolean") throw integrity("record-invalid", "The selected record has an invalid subflow started fact.");
  const sourceWarnings: Warning[] = [], item = subflowOrigin(event, subject, sourceWarnings), derivedChild = `stages/${stage}/${String(repeat ?? 1)}/${String(attempt)}/subflows/${String(call)}`, outcome = subflowCompletion(event, started, derivedChild);
  const child = started ? optional(derivedChild, subject, "child", sourceWarnings) : null;
  return { order, type: "subflow", row: { caller, attempt, call, subflow, item, started, child, exit: outcome?.exit ?? null, cause: outcome?.cause ?? null }, sourceWarnings };
}
function subflowRows(events: Event[]): OrderedRow[] {
  return events.flatMap((event, order) => event["event"] === "subflow_call" ? [subflowRow(event, order)] : []);
}

function clipped(value: string | number | boolean | null, subject: string, field: string, warnings: Warning[]): string {
  if (value === null) return "-";
  const held = inertText(typeof value === "string" ? value : String(value), 480);
  if (held.omitted > 0) warnings.push({ code: "text-unavailable", subject, field, omittedBytes: held.omitted });
  return held.text;
}

function warnField(value: string | null, subject: string, field: string, source: Warning[], warnings: Warning[]): void {
  warnings.push(...source.filter((warning) => warning.field === field));
  clipped(value, subject, field, warnings);
}

function warningRows(rows: OrderedRow[], root: RootModel): Warning[] {
  const warnings: Warning[] = [], data = root.data;
  warnField(data.run, data.run, "run", root.sourceWarnings, warnings);
  warnField(data.startedAt, data.run, "startedAt", root.sourceWarnings, warnings);
  warnField(data.endedAt, data.run, "endedAt", root.sourceWarnings, warnings);
  warnField(data.cause, data.run, "cause", root.sourceWarnings, warnings);
  for (const held of rows) {
    if (held.type === "stage") {
      const row = held.row, subject = warningSubject(`${row.identity}/${String(row.attempt)}`, "stage");
      for (const field of ["identity", "stage", "cause", "scratch"] as const) warnField(row[field], subject, field, held.sourceWarnings, warnings);
    } else {
      const row = held.row, subject = warningSubject(`${row.caller}/${String(row.attempt)}:call/${String(row.call)}`, "subflow");
      for (const field of ["caller", "subflow", "item", "child", "cause"] as const) warnField(row[field], subject, field, held.sourceWarnings, warnings);
    }
  }
  return warnings;
}

function summary(all: OrderedRow[], kept: OrderedRow[], warningCount: number): Record<string, number> {
  const stageCount = all.filter((row) => row.type === "stage").length, stagesIncluded = kept.filter((row) => row.type === "stage").length;
  const subflowCount = all.length - stageCount, subflowsIncluded = kept.length - stagesIncluded;
  return { stageCount, stagesIncluded, stagesOmitted: stageCount - stagesIncluded, subflowCount, subflowsIncluded, subflowsOmitted: subflowCount - subflowsIncluded, warningCount, warningsOmitted: Math.max(0, warningCount - WARNING_LIMIT) };
}

function document(root: RootData, all: OrderedRow[], kept: OrderedRow[], warnings: Warning[]): Record<string, unknown> {
  return { schemaVersion: 1, kind: "bot.run.show", data: { ...root, stages: kept.flatMap((held) => held.type === "stage" ? [held.row] : []), subflows: kept.flatMap((held) => held.type === "subflow" ? [held.row] : []) }, summary: summary(all, kept, warnings.length), warnings: warnings.slice(0, WARNING_LIMIT) };
}

function stageLine(row: StageRow): string {
  const subject = `${row.identity}/${String(row.attempt)}`;
  return `| ${clipped(row.identity, subject, "identity", [])} | ${clipped(row.stage, subject, "stage", [])} | ${String(row.repeat ?? "-")} | ${String(row.attempt)} | ${row.state} | ${String(row.exit ?? "-")} | ${row.cause ?? "-"} | ${clipped(row.scratch, subject, "scratch", [])} |`;
}

function subflowLine(row: SubflowRow): string {
  const subject = `${row.caller}/${String(row.attempt)}:call/${String(row.call)}`;
  return `| ${clipped(row.caller, subject, "caller", [])} | ${String(row.attempt)} | ${String(row.call)} | ${clipped(row.subflow, subject, "subflow", [])} | ${clipped(row.item, subject, "item", [])} | ${String(row.started)} | ${clipped(row.child, subject, "child", [])} | ${String(row.exit ?? "-")} | ${row.cause ?? "-"} |`;
}

function markdown(root: RootData, all: OrderedRow[], kept: OrderedRow[], warnings: Warning[]): string {
  const out = [
    `run: ${clipped(root.run, root.run, "run", [])}`, `state: ${root.state}`,
    `startedAt: ${clipped(root.startedAt, root.run, "startedAt", [])}`,
    `endedAt: ${clipped(root.endedAt, root.run, "endedAt", [])}`,
    `exit: ${String(root.exit ?? "-")}`, `cause: ${clipped(root.cause, root.run, "cause", [])}`, "",
    "| identity | stage | repeat | attempt | state | exit | cause | scratch |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...kept.flatMap((held) => held.type === "stage" ? [stageLine(held.row)] : []), "",
    "| caller | attempt | call | subflow | item | started | child | exit | cause |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...kept.flatMap((held) => held.type === "subflow" ? [subflowLine(held.row)] : []),
  ];
  const counts = summary(all, kept, warnings.length);
  out.push("", ...Object.entries(counts).map(([name, value]) => `${name}: ${String(value)}`), "", "| code | subject | field | omittedBytes |", "| --- | --- | --- | --- |");
  for (const warning of warnings.slice(0, WARNING_LIMIT)) out.push(`| ${warning.code} | ${inertText(warning.subject).text} | ${warning.field} | ${String(warning.omittedBytes)} |`);
  return `${out.join("\n")}\n`;
}

function fit(root: RootData, all: OrderedRow[], warnings: Warning[], maximum = RUN_SHOW_DOCUMENT_BYTES): { kept: OrderedRow[]; json: Buffer; human: Buffer } {
  const limit = Math.min(all.length, RUN_SHOW_ROW_LIMIT);
  for (let count = limit; count >= 0; count -= 1) {
    const kept = all.slice(0, count), json = Buffer.from(`${jsonObject(document(root, all, kept, warnings))}\n`), human = Buffer.from(markdown(root, all, kept, warnings));
    if (json.length < maximum && human.length < maximum && human.toString().split("\n").every((line) => Buffer.byteLength(line) <= 4_096)) return { kept, json, human };
  }
  throw integrity("document-too-large", "Run facts do not fit the run show document limit.");
}

export interface RunShowReading { json: Buffer; human: Buffer }
function missing(reason: unknown): boolean {
  return typeof reason === "object" && reason !== null && Reflect.get(reason, "code") === "ENOENT";
}

function runDirectoryNames(home: string): Promise<string[]> {
  const runs = join(home, "runs");
  return lstat(runs).then((held) => {
    if (!held.isDirectory()) throw dependency("runs-invalid", "Run show requires the runs entry to be a directory.");
    return readdir(runs, { withFileTypes: true });
  }).then(
    (entries) => entries.filter((entry) => entry.isDirectory() && !entry.name.endsWith(".lock")).map((entry) => entry.name).sort(bytewise),
    (reason: unknown) => {
      if (missing(reason)) return [];
      if (reason instanceof ReadingFailure) throw reason;
      throw dependency("runs-unavailable", "Run show could not inspect the runs directory.");
    },
  );
}

function homeNames(home: string): Promise<string[]> {
  return lstat(home).then((homeStat) => {
    if (!homeStat.isDirectory()) throw failure("home-invalid", "not-directory", "Run show requires a directory home.", 1, { home });
    return runDirectoryNames(home);
  }, (reason: unknown) => {
    if (missing(reason)) throw failure("home-not-found", "missing", "Run show could not find the home.", 1, { home });
    throw dependency("home-unavailable", "Run show could not inspect the home.");
  }).then((names) => names, (reason: unknown) => { if (reason instanceof ReadingFailure) throw reason; throw dependency("home-unavailable", "Run show could not inspect the home."); });
}

function selectedRun(home: string, prefix: string, names: string[]): { run: string; directory: string } {
  const matches = names.filter((name) => name.startsWith(prefix));
  if (matches.length !== 1) throw failure("home-not-found", matches.length === 0 ? "run-missing" : "run-ambiguous", matches.length === 0 ? "Run show found no matching run." : "Run show found more than one matching run.", 1, { prefix, matches: matches.length });
  const run = matches[0];
  if (run === undefined) throw dependency("selection-unavailable", "Run show could not select a run.");
  return { run, directory: join(home, "runs", run) };
}

function selectedRecord(directory: string) {
  return heldRecord(directory).then((record) => record, () => { throw dependency("record-unavailable", "Run show could not inspect the selected record."); });
}

function rootState(start: Event | undefined, end: Event | undefined, directory: string, live: RunShowDependencies["live"] = isRunLive): string {
  if (end !== undefined) return "ended";
  if (start === undefined) return "incomplete";
  return live(directory) ? "running" : "crashed";
}

function rootEvents(events: Event[]): { start?: Event; end?: Event } {
  const start = events[0];
  if (start !== undefined && start["event"] !== "run_start") throw integrity("record-invalid", "The selected record does not start with run_start.");
  validateTimestamp(start, "start");
  let end: Event | undefined;
  for (const event of events) if (event["event"] === "run_end") end = event;
  validateTimestamp(end, "end");
  return { ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) };
}

function validateTimestamp(event: Event | undefined, name: string): void {
  if (event !== undefined && !timestamp(event["ts"])) throw integrity("record-invalid", `The selected run has an invalid ${name} timestamp.`);
}

function settleStageFacts(rows: OrderedRow[], facts: StageFacts): void {
  for (const held of rows) {
    if (held.type !== "stage") continue;
    const row = held.row, key = keyOf(row.stage, row.repeat, row.attempt), ending = facts.ends.get(key);
    if (row.state === "carried") continue;
    if (facts.unreconciled.has(key)) { row.state = "unreconciled"; row.exit = ending?.exit ?? null; row.cause = ending?.cause ?? null; }
    else if (ending !== undefined) { row.state = "ended"; row.exit = ending.exit; row.cause = ending.cause; }
  }
}

async function observeScratch(rows: OrderedRow[], scratchRoot: string, home: string, run: string, inspect?: RunShowDependencies["scratch"]): Promise<void> {
  const observed = new Map<string, string | null>();
  for (const held of rows) {
    if (held.type !== "stage" || held.row.state === "carried") continue;
    const key = `${held.row.stage}\0${String(held.row.repeat ?? 1)}`;
    if (!observed.has(key)) observed.set(key, await scratchPath(scratchRoot, home, run, held.row.stage, held.row.repeat, inspect));
    held.row.scratch = observed.get(key) ?? null;
  }
}

function rootData(run: string, state: string, start: Event | undefined, end: Event | undefined, outcome: { exit: number; cause: string } | undefined): RootModel {
  const startedAt = start?.["ts"], endedAt = end?.["ts"];
  const name = required(start?.["run"] ?? run, "run name"), sourceWarnings: Warning[] = [];
  return { data: { run: name, state, startedAt: optional(startedAt, name, "startedAt", sourceWarnings), endedAt: optional(endedAt, name, "endedAt", sourceWarnings), exit: outcome?.exit ?? null, cause: outcome?.cause ?? null, stages: [], subflows: [] }, sourceWarnings };
}

async function reading(home: string, scratchRoot: string, run: string, directory: string, dependencies: RunShowDependencies): Promise<RunShowReading> {
  const record = await selectedRecord(directory);
  if (record === undefined) throw failure("home-not-found", "record-missing", "The selected run has no record.", 1, { run });
  if (record.fault !== undefined || record.classification === "invalid") throw integrity(record.fault?.mark ?? "invalid", "The selected run has an invalid record.");
  const events = record.events, rootEventsHeld = rootEvents(events), { start, end } = rootEventsHeld;
  const outcome = end === undefined ? undefined : pair(end, "run"), stages = stageFacts(events), rows = [...stages.rows, ...subflowRows(events)].sort((a, b) => a.order - b.order);
  if (end !== undefined && outcome === undefined) throw integrity("record-invalid", "The selected run has an incomplete outcome.");
  settleStageFacts(rows, stages);
  const state = rootState(start, end, directory, dependencies.live);
  await observeScratch(rows, scratchRoot, home, run, dependencies.scratch);
  const root = rootData(run, state, start, end, outcome);
  const warnings = warningRows(rows, root), fitted = fit(root.data, rows, warnings, dependencies.documentBytes);
  return { json: fitted.json, human: fitted.human };
}

export function readRunShow(home: string, prefix: string, scratchRoot: string, dependencies: RunShowDependencies = {}): Promise<RunShowReading> {
  return homeNames(home).then((names) => {
    const selected = selectedRun(home, prefix, names);
    return reading(home, scratchRoot, selected.run, selected.directory, dependencies);
  });
}

export function runShowFailure(reason: unknown): CliFailure {
  return reason instanceof ReadingFailure ? reason.failure : { code: "dependency-failed", cause: "unexpected", message: "Run show could not complete the reading.", retryable: false, details: {}, exit: 4 };
}
