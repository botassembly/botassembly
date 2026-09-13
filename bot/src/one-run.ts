import { basename, isAbsolute, join } from "node:path";
import { jsonObject } from "./check.ts";
import { lstatExists } from "./documents.ts";
import { childRecordAgrees } from "./child-record.ts";
import { explainRun } from "./explain.ts";
import { scratchOfRun } from "./invocation.ts";
import { noHome, nothing, output, result, runNames, RUNS_BOUND, type InspectionResult } from "./inspection.ts";
import { plainly } from "./model.ts";
import { mapPool } from "./pool.ts";
import { allSessionChoices, missingSession, outcomeLines, scratchLines, sessionChoices, showLines } from "./readings.ts";
import { CAPTURE, hashAssemblyEntries, hashBytes } from "./record.ts";
import { field, heldRecord, type HeldRecord } from "./record-lines.ts";
import { checkFact, judgedRejection, malformedSession, refusedDraft, retainedRequestFact, sealedOutput } from "./record-operation.ts";
import { heldRunFile, heldRunTree, type HeldRunTree } from "./run-files.ts";
import { visitHeldRunLines } from "./session-lines.ts";
import { readSessionPage, type SessionPageRequest } from "./session-page.ts";
import { settledSessionLineToolReader } from "./session-decoder.ts";
import { renderSession, renderSettledTool, type SettledTool, withinSessionLineLimit } from "./session.ts";

// A run that is not there and a record that cannot be read are one answer to all
// the one-run verbs — nothing found, exit 1 (inspection.md) — plus the fault.
export async function openRunDirectory(home: string, prefix: string): Promise<{ directory: string } | { failed: InspectionResult }> {
  // First, because an absent home holds no run names and every verb here then
  // blamed the prefix for a typo in the path (ticket 0136).
  if (!lstatExists(home)) return { failed: nothing(noHome(home), "home-missing") };
  const matches = (await runNames(home)).filter((name) => name.startsWith(prefix));
  const one = matches[0];
  // Many and none were one silence, and neither could be told from a crash: an
  // ambiguous prefix says how many and asks for more of the name (ticket 0127).
  if (matches.length !== 1 || one === undefined) return { failed: nothing(matches.length === 0 ? `No run's name starts with ${prefix}.` : `${String(matches.length)} runs start with ${prefix}; give more of the name.`, matches.length === 0 ? "run-missing" : "run-ambiguous") };
  return { directory: join(home, "runs", one) };
}

async function openRun(home: string, prefix: string, forensic = false): Promise<{ directory: string; record: HeldRecord } | { failed: InspectionResult }> {
  const selected = await openRunDirectory(home, prefix);
  if ("failed" in selected) return selected;
  const { directory } = selected;
  const record = await heldRecord(directory);
  if (record === undefined) return { failed: nothing(`Run ${basename(directory)} has no record to read.`, "record-missing") };
  return record.fault === undefined || (forensic && record.classification === "invalid")
    ? { directory, record }
    : { failed: nothing(record.fault.says, "record-invalid") };
}

export async function inspectExplain(home: string, prefix: string, stage: string | undefined, json: boolean): Promise<InspectionResult> {
  const run = await openRun(home, prefix);
  return "failed" in run ? run.failed : explainRun(run.directory, run.record.events, stage, json);
}

export async function inspectRequest(home: string, prefix: string): Promise<InspectionResult> {
  const request = await selectRequest(home, prefix);
  if ("failed" in request) return request.failed;
  const file = await heldRunFile(request.directory, request.path);
  if (file.kind !== "held") return nothing("This run has no readable request.");
  if (file.size !== request.bytes || hashBytes(file.bytes) !== request.sha256) return nothing(`The retained request of ${basename(request.directory)} does not match its record.`);
  return { exitCode: 0, output: file.bytes };
}

export async function selectRequest(home: string, prefix: string): Promise<
{ directory: string; path: string; sha256: string; bytes: number } | { failed: InspectionResult }> {
  const run = await openRun(home, prefix);
  if ("failed" in run) return run;
  const request = retainedRequestFact(run.record.events.find((event) => event["event"] === "run_start")?.["request"]);
  return request === undefined
    ? { failed: nothing("This run has no readable request.") }
    : { directory: run.directory, path: request.path, sha256: request.sha256, bytes: request.bytes };
}

type CaptureState = "complete" | "absent" | "unreadable" | "partial";

function capturePath(path: string): boolean {
  const parts = path.split("/");
  return path.length > 0 && !isAbsolute(path) && !path.includes("\\")
    && parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

function captureDocument(run: string, state: CaptureState, files: string[], file?: { path: string; content: string }): string {
  return jsonObject({
    schemaVersion: 1, run, state, files,
    ...(file === undefined ? {} : { file: { path: file.path, encoding: "base64", content: file.content } }),
  });
}

function captureState(tree: HeldRunTree, recorded: string | undefined): CaptureState {
  if (tree.kind !== "held") return tree.kind;
  const actual = hashAssemblyEntries(tree.files.map((file) => ({
    path: file.path, sha256: file.sha256, executable: file.executable,
  })));
  return actual === recorded ? "complete" : "partial";
}

function captureReading(name: string, tree: HeldRunTree, state: CaptureState, path: string | undefined, json: boolean): InspectionResult {
  const files = tree.files.map((file) => file.path);
  if (path === undefined && json) return { exitCode: state === "complete" ? 0 : 1, output: output([captureDocument(name, state, files)]) };
  if (path === undefined) return state === "complete" ? { exitCode: 0, output: output(files) } : nothing(`The capture of run ${name} is ${state}.`);
  if (state !== "complete") return nothing(`The capture of run ${name} is ${state}.`);
  const file = tree.files.find((candidate) => candidate.path === path);
  if (file?.bytes === undefined) return nothing(`The capture of run ${name} has no readable file ${path}.`);
  return json
    ? { exitCode: 0, output: output([captureDocument(name, state, files, { path, content: file.bytes.toString("base64") })]) }
    : { exitCode: 0, output: file.bytes };
}

/** Inspect one run's sealed assembly without resolving the live assembly. */
export async function inspectCapture(home: string, prefix: string, path: string | undefined, json: boolean): Promise<InspectionResult> {
  if (path !== undefined && !capturePath(path)) return nothing("Give a normalized relative capture path.");
  const run = await openRun(home, prefix);
  if ("failed" in run) return run.failed;
  const start = run.record.events.find((event) => event["event"] === "run_start");
  const held = start?.["assembly_hash"] ?? start?.["assemblyHash"];
  const recorded = typeof held === "string" ? held : undefined;
  const tree = recorded === undefined ? { kind: "absent" as const, files: [] } : await heldRunTree(run.directory, CAPTURE, path);
  return captureReading(basename(run.directory), tree, captureState(tree, recorded), path, json);
}

// The last output SEALED — the run's, or the named stage's. Sealed is the whole
// of it: a stage cancelled between its agent stopping and its checks finishing
// keeps its output unsealed and nothing judged it (runtime.md), so handing those
// bytes back as an answer would invent a verdict. Last, because a stage inside a
// LOOP seals one per repeat and the last one is what fed the rest (loop.md) —
// and because a flow ENDS in a stage (graph.md, `tail-container`), so the tail
// seals after a PARALLEL's branches do and the last sealed is the run's answer.
// The seal's own sha256 rides along beside its path: it is written at seal time
// (record.ts, `sealOutput`) and was read by nobody until ticket 0147.
// A run answers only when it finished and succeeded: `bot run` prints the output
// on exit 0 and nothing on any other (cli.ts), so a refused, failed or dead run
// has no answer. What its stages sealed on the way is still there and a stage
// argument still reaches it — how far it got is answerable; what it answered is not.
function unanswered(events: Record<string, unknown>[]): string | undefined {
  let end: Record<string, unknown> | undefined;
  for (const event of events) if (event["event"] === "run_end") end = event;
  if (end === undefined) return "This run has not finished.";
  return end["exit"] === 0 ? undefined : `This run ended ${field(end, "exit")}/${field(end, "cause")} and has no output.`;
}

export interface SelectedOutput { directory: string; path: string; sha256: string }

/** Select one accepted output without reading its bytes. */
export async function selectOutput(
  home: string, prefix: string, stage: string | undefined,
): Promise<SelectedOutput | { failed: InspectionResult }> {
  const run = await openRun(home, prefix);
  if ("failed" in run) return run;
  const says = stage === undefined ? unanswered(run.record.events) : undefined;
  if (says !== undefined) return { failed: nothing(says) };
  const seal = sealedOutput(run.record.events, stage);
  if (seal === undefined) {
    return { failed: nothing(stage === undefined
      ? "This run sealed no output."
      : `This run has no sealed output for stage ${stage}.`) };
  }
  return { directory: run.directory, path: seal.path, sha256: seal.sha256 };
}

export async function inspectOutput(home: string, prefix: string, stage: string | undefined): Promise<InspectionResult> {
  const selected = await selectOutput(home, prefix, stage);
  if ("failed" in selected) return selected.failed;
  // `bot session`'s rule for a path out of a record (0083); gone is said, not thrown.
  const file = await heldRunFile(selected.directory, selected.path);
  if (file.kind !== "held") return nothing(`This run no longer holds ${selected.path}.`);
  const bytes = file.bytes;
  // The record's hash gets its reader (ticket 0147). This verb REPRODUCES bytes as
  // the run's answer where show and session describe them, so bytes the record
  // disowns are refused rather than piped onward. A seal carrying no hash promised
  // none and cannot disown anything: those bytes go back as they always did.
  if (hashBytes(bytes) !== selected.sha256) return nothing(`The sealed output of ${basename(selected.directory)} does not match its record.`);
  return { exitCode: 0, output: bytes };
}

// A refusal can retain a candidate without judging it. It is readable only by
// this verb: `bot output` keeps the sealed-answer boundary above.
export async function inspectDraft(home: string, prefix: string, stage: string): Promise<InspectionResult> {
  const run = await openRun(home, prefix);
  if ("failed" in run) return run.failed;
  const held = refusedDraft(run.record.events, stage);
  if (held === undefined) return nothing(`This run has no draft for stage ${stage}.`);
  const file = await heldRunFile(run.directory, held.path);
  if (file.kind !== "held") return nothing(`This run no longer holds ${held.path}.`);
  if (hashBytes(file.bytes) !== held.sha256) {
    return nothing(`The draft output of ${basename(run.directory)} does not match its record.`);
  }
  return { exitCode: 0, output: file.bytes, diagnostics: ["This draft was never judged."] };
}

// A stage may finish every structural check and then be rejected by its
// authoritative gate. Those bytes were judged, so they are not a draft; they
// were not sealed, so they are not an output. The failure hook still needs the
// exact rejected document to preserve bounded findings for the next attempt.
export async function inspectRejected(home: string, prefix: string, stage: string): Promise<InspectionResult> {
  const run = await openRun(home, prefix);
  if ("failed" in run) return run.failed;
  const held = judgedRejection(run.record.events, stage);
  if (held === undefined) return nothing(`This run has no judged rejection for stage ${stage}.`);
  const file = await heldRunFile(run.directory, held.path);
  if (file.kind !== "held") return nothing(`This run no longer holds ${held.path}.`);
  if (hashBytes(file.bytes) !== held.sha256) return nothing(`The rejected output of ${basename(run.directory)} does not match its record.`);
  return { exitCode: 0, output: file.bytes, diagnostics: ["This stage output was judged and rejected; it was never sealed."] };
}

export function showRecord(home: string, directory: string, record: HeldRecord, json: boolean, scratchRoot: string): InspectionResult {
  if (json) {
    const shown = result(record.lines);
    if (record.classification === "invalid") return { ...shown, exitCode: 1, diagnostics: record.fault === undefined ? [] : [record.fault.says] };
    return record.notice === undefined ? shown : { ...shown, diagnostics: [record.notice] };
  }
  const events = record.events;
  // The scratch root is the home's and the run's together (ticket 0140), and
  // each attempt's path is stat'd: the cache may have been emptied since, and
  // an unmarked line naming nothing sent readers hunting for a directory that
  // the OS took. `lstat`, so a broken link at the name is still a name.
  const scratch = scratchOfRun(scratchRoot, home, basename(directory));
  return result([...outcomeLines(events), ...showLines(events), ...scratchLines(events, scratch, (path) => !lstatExists(path))]);
}

function childParts(parts: string[]): boolean {
  return parts.length >= 6 && !parts.some((part) => part.length === 0 || part === "." || part === "..");
}

function childSuffix(parts: string[]): boolean {
  return parts[0] === "stages" && parts.at(-2) === "subflows"
    && /^[1-9][0-9]*$/u.test(parts.at(-4) ?? "")
    && /^[1-9][0-9]*$/u.test(parts.at(-3) ?? "")
    && /^[1-9][0-9]*$/u.test(parts.at(-1) ?? "");
}

export function childReference(reference: string): boolean {
  const parts = reference.split("/");
  return !isAbsolute(reference) && childParts(parts) && childSuffix(parts);
}

const childUnavailable = (): InspectionResult => nothing("The recorded child is unavailable.");

// `bot show --check`: the sealed captured output of one named check. A run may
// record the same check more than once — a warning turn once did, a retry still
// can — and the recordings answer as one only when every successful one agrees
// on `capture` and on `sha256` where both carry one. `ts` is never compared:
// two recordings at different times are still one answer or a conflict on
// content alone.
interface SuccessfulCheck { capture: string; sha256?: string }

// One matching recording read: undefined is a malformed one, "failed" is a
// recorded non-zero exit, and a shape carrying `capture` is a success.
function successfulChecks(events: Record<string, unknown>[], file: string): SuccessfulCheck[] | undefined {
  const held: SuccessfulCheck[] = [];
  for (const event of events) {
    if (event["event"] !== "check" || event["file"] !== file) continue;
    const read = checkFact(event);
    if (read === undefined) return undefined;
    if (read !== "failed") held.push(read);
  }
  return held;
}

export async function inspectCheck(home: string, prefix: string, file: string): Promise<InspectionResult> {
  const run = await openRun(home, prefix);
  if ("failed" in run) return run.failed;
  const name = basename(run.directory);
  const successes = successfulChecks(run.record.events, file);
  if (successes === undefined) return nothing(`Run ${name} holds a malformed recording of check ${file}.`);
  const first = successes[0];
  if (first === undefined) return nothing(`Run ${name} has no successful recording of check ${file}.`);
  const captures = new Set(successes.map((success) => success.capture));
  const shas = new Set(successes.flatMap((success) => success.sha256 ?? []));
  if (captures.size > 1) return nothing(`The successful recordings of check ${file} in run ${name} disagree on capture: ${[...captures].join(", ")}.`);
  if (shas.size > 1) return nothing(`The successful recordings of check ${file} in run ${name} disagree on sha256.`);
  const held = await heldRunFile(run.directory, first.capture);
  if (held.kind !== "held") return nothing(`Run ${name} no longer holds ${first.capture}.`);
  return { exitCode: 0, output: held.bytes };
}

async function showChild(
  home: string, directory: string, parent: Record<string, unknown>, child: string, json: boolean, scratchRoot: string,
): Promise<InspectionResult> {
  const record = await heldRecord(directory, `${child}/record.jsonl`);
  if (record === undefined) return childUnavailable();
  if (json && record.classification === "invalid") {
    return showRecord(home, join(directory, ...child.split("/")), record, true, scratchRoot);
  }
  if (record.fault !== undefined || !await childRecordAgrees(directory, child, parent, record)) return childUnavailable();
  return showRecord(home, join(directory, ...child.split("/")), record, json, scratchRoot);
}

export async function inspectShow(home: string, prefix: string, json: boolean, scratchRoot: string, child?: string): Promise<InspectionResult> {
  const run = await openRun(home, prefix, json && child === undefined);
  if ("failed" in run) return run.failed;
  if (child === undefined) return showRecord(home, run.directory, run.record, json, scratchRoot);
  const parent = run.record.events.find((event) => event["event"] === "subflow_call" && event["started"] === true && event["child"] === child);
  if (!childReference(child) || parent === undefined) return childUnavailable();
  // The child spelling came from its parent, but it is still an opaque path:
  // heldRecord walks it from the held parent root and rejects every linked
  // component before it opens the child's record.
  return showChild(home, run.directory, parent, child, json, scratchRoot);
}

/** What `bot logs` was asked for: one run or the whole home, narrowed by
 *  exact-match filters. No patterns — the surface is closed (ticket 0142). */
export interface LogsQuery {
  prefix?: string;
  tool?: string;
  stage?: string;
  failed: boolean;
  all: boolean;
  args: boolean;
  offset: number;
  limit: number;
}

// Nothing found says WHICH nothing (inspection.md), and under a filter the
// which is the filter: a home holding twenty-nine calls that are all `ok` told
// `--failed` it held no tool calls, which a reader derives a falsehood from.
// Empty and unfiltered is still the home, or the run, being empty.
const emptily = (query: LogsQuery, unfiltered: string): string =>
  query.failed || query.tool !== undefined || query.stage !== undefined ? "No tool call matches." : unfiltered;

function kept(call: SettledTool, query: LogsQuery): boolean {
  if (query.failed && !call.failed) return false;
  return query.tool === undefined || call.name === query.tool;
}

// One run's settled tool calls. A stage is narrowed before the sessions are
// read, because a stage nobody asked about is a file nobody has to open.
interface ToolRows { rows: string[]; oversized: boolean; malformed: boolean }

async function toolRows(directory: string, events: Record<string, unknown>[], query: LogsQuery): Promise<ToolRows> {
  const selected = events.filter((event) => event["event"] === "stage_start"
    && (query.stage === undefined || event["stage"] === query.stage));
  if (selected.some((event) => malformedSession(event))) return { rows: [], oversized: false, malformed: true };
  const choices = allSessionChoices(selected);
  const held = await Promise.all(choices.map(async (choice) => {
    const calls: SettledTool[] = [];
    const read = settledSessionLineToolReader(choice.stage, choice.repeat);
    const file = await visitHeldRunLines(directory, choice.path, (line) => {
      calls.push(...read(line));
    });
    if (file.kind === "too-large") return { calls: [], notices: [], oversized: true };
    if (file.kind !== "held") return { calls: [], notices: [missingSession(choice)], oversized: false };
    return { calls, notices: [], oversized: false };
  }));
  if (held.some((row) => row.oversized)) return { rows: [], oversized: true, malformed: false };
  // A missing-session notice is not a tool call, so tool filters omit it.
  return { rows: held.flatMap(({ calls, notices }) => [
    ...notices.filter(() => !query.failed && query.tool === undefined),
    ...calls.filter((call) => kept(call, query)).map((call) => renderSettledTool(call, query.args)),
  ]), oversized: false, malformed: false };
}

function page(rows: string[], query: LogsQuery): { rows: string[]; diagnostics: string[] } {
  const shown = rows.slice(query.offset, query.offset + query.limit);
  if (query.offset === 0 && shown.length === rows.length) return { rows: shown, diagnostics: [] };
  const end = query.offset + shown.length;
  const next = end < rows.length ? `; use --offset ${String(end)} for the next page` : "";
  return { rows: shown, diagnostics: [
    `Showing tool calls ${String(query.offset + (shown.length > 0 ? 1 : 0))}-${String(end)} of ${String(rows.length)}${next}.`,
  ] };
}

// The home's runs, oldest first — `bot runs`' order — each row carrying the run
// it came from. A run still going is read exactly as a finished one is: the
// record is append-only and so is a session, so the lines that exist are the
// lines that happened (inspection.md, "Reading a run that is still going").
// A record bot could not read gets its sentence beside the rows it did not
// contribute, the way the listing reports one (inspection.md): a reading that
// swallowed it would claim a home held no failed call when it never looked.
async function homeRows(home: string, names: string[], query: LogsQuery): Promise<[rows: string[], says: string[], oversized: boolean]> {
  const runs = await mapPool(names, RUNS_BOUND, async (name): Promise<[string[], string[], boolean]> => {
    const directory = join(home, "runs", name);
    const record = await heldRecord(directory);
    if (record === undefined) return [[], [`Run ${name} has no record to read.`], false];
    if (record.fault !== undefined) return [[], [record.fault.says], false];
    const tools = await toolRows(directory, record.events, query);
    if (tools.malformed) return [[], [`Run ${name} has a malformed session recording.`], false];
    return [tools.rows.map((row) => plainly(`${name}  ${row}`)), [], tools.oversized];
  });
  return [runs.flatMap(([rows]) => rows), runs.flatMap(([, says]) => says), runs.some(([, , oversized]) => oversized)];
}

export async function inspectLogs(home: string, query: LogsQuery): Promise<InspectionResult> {
  if (query.prefix !== undefined) {
    return inspectRunLogs(home, query.prefix, query);
  }
  if (!lstatExists(home)) return nothing(noHome(home));
  const names = await runNames(home);
  const shown = query.all ? names : names.slice(-RUNS_BOUND);
  const [rows, says, oversized] = await homeRows(home, shown, query);
  if (oversized) return nothing("A run's session is too large.");
  // The notice goes to STDERR, so stdout stays byte-clean for a pipe and
  // nothing is silently hidden — the split the progress line already uses. It
  // counts runs under every filter alike, because a filtered reading that did
  // not say which runs it searched would read as a search of the whole home.
  if (shown.length < names.length) says.push(`Showing the newest ${String(shown.length)} runs of ${String(names.length)}; --all shows every run.`);
  const empty = rows.length === 0 ? [emptily(query, "This home holds no tool calls.")] : [];
  const held = page(rows, query);
  return { ...result(held.rows), diagnostics: [...empty, ...held.diagnostics, ...says] };
}

async function inspectRunLogs(home: string, prefix: string, query: LogsQuery): Promise<InspectionResult> {
  const run = await openRun(home, prefix);
  if ("failed" in run) return run.failed;
  const rows = await toolRows(run.directory, run.record.events, query);
  if (rows.malformed) return nothing("This run has a malformed session recording.");
  if (rows.oversized) return nothing("This run's session is too large.");
  if (rows.rows.length === 0) return nothing(emptily(query, "This run made no tool calls."));
  const held = page(rows.rows, query);
  return { ...result(held.rows), diagnostics: held.diagnostics };
}

function chosenSession(events: Record<string, unknown>[], stage: string): ReturnType<typeof sessionChoices> | InspectionResult {
  const selected = events.filter((event) => event["event"] === "stage_start" && event["stage"] === stage);
  if (selected.some((event) => malformedSession(event, false))) return nothing(`Stage ${stage} has a malformed session recording.`, "session-invalid");
  return sessionChoices(selected, stage);
}

async function readSelectedSession(directory: string, choice: ReturnType<typeof sessionChoices>[number], raw: boolean): Promise<InspectionResult> {
  const file = await heldRunFile(directory, choice.path);
  if (file.kind === "too-large") return nothing("This run's session is too large.", "session-too-large");
  if (file.kind !== "held") return { ...result([missingSession(choice)]), cause: file.kind === "missing" ? "session-missing" : "session-invalid" };
  const source = file.bytes.toString("utf8");
  if (!withinSessionLineLimit(source)) return nothing("This run's session is too large.", "session-too-large");
  return raw ? { exitCode: 0, output: file.bytes } : { exitCode: 0, output: output(renderSession(source)) };
}

export async function inspectSession(
  home: string, prefix: string, stage: string, repeat: number | undefined, raw: boolean, page?: SessionPageRequest,
): Promise<InspectionResult> {
  const run = await openRun(home, prefix);
  if ("failed" in run) return run.failed;
  const selected = chosenSession(run.record.events, stage);
  if (!Array.isArray(selected)) return selected;
  const choices = selected;
  if (repeat === undefined && choices.some((choice) => choice.repeat !== undefined)) {
    if (page?.after !== undefined) return nothing(`Give --repeat before continuing stage ${stage} with a session cursor.`, "cursor-selection");
    return result(choices.map((choice) => plainly(`${stage}  repeat ${String(choice.repeat)}  ${choice.path}`)));
  }
  // Reaching here with no `repeat` means every choice carries none, so the find
  // succeeded: a miss with choices left is always the repeat, never the stage.
  const choice = choices.find((held) => repeat === undefined ? held.repeat === undefined : held.repeat === repeat);
  if (choice === undefined) return missingSessionChoice(choices.length, stage, repeat);
  return page === undefined ? readSelectedSession(run.directory, choice, raw) : readSessionPage(run.directory, stage, repeat, choice, page);
}

function missingSessionChoice(choices: number, stage: string, repeat: number | undefined): InspectionResult {
  return choices === 0
    ? nothing(`This run has no stage named ${stage}.`, "stage-missing")
    : nothing(`Stage ${stage} has no repeat ${String(repeat)} in this run.`, "repeat-missing");
}
