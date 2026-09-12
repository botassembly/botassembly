import { isAbsolute, join } from "node:path";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { jsonObject } from "./check.ts";
import { lstatExists } from "./documents.ts";
import { takeHome } from "./flags.ts";
import { runNames } from "./inspection.ts";
import { inertText, newCommandFailure, type CommandResult } from "./new-command-result.ts";
import { errorCode } from "./model.ts";
import { heldRecord } from "./record-lines.ts";
import { boundedHeldRunFile } from "./run-files.ts";
import type { CliFailure } from "./run-list-query.ts";

const RUN_CHECK_CAPTURE_BYTES = 16_777_216;

interface Boundary {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout(bytes: string | Uint8Array): void;
  rawStdout?(): Writable;
  stderr(bytes: string | Uint8Array): void;
}

interface Query {
  run: string;
  check: string;
  json: boolean;
  raw: boolean;
  file?: string;
  stage?: string;
  retry?: number;
  repeat?: number;
}

interface Recording {
  stage: string;
  repeat: number | null;
  retry: number;
  exit: number | null;
  capture: string;
  executableFile: string | null;
  executableSha256: string | null;
}

const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const nonNegative = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function failure(cause: string, message: string, exit: 1 | 2 | 5): CliFailure {
  return { code: exit === 2 ? "request-invalid" : exit === 5 ? "integrity-failed" : "home-not-found", cause, message, retryable: false, details: {}, exit };
}

function normalized(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path) || path.includes("\\")) return false;
  return path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function optionValues(args: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let at = 0; at < args.length; at += 1) if (args[at] === name && args[at + 1] !== undefined) values.push(args[at + 1] ?? "");
  return values;
}

const VALUED = ["--home", "--file", "--stage", "--retry", "--repeat"];

function valuedFault(args: readonly string[]): CliFailure | undefined {
  for (const name of VALUED) {
    const count = args.filter((word) => word === name).length, value = optionValues(args, name)[0];
    if (count > 1) return failure("option-repeated", `Run check accepts ${name} once.`, 2);
    if (count === 1 && (value === undefined || value.startsWith("-"))) return failure("value-missing", `Run check requires a value after ${name}.`, 2);
  }
  return undefined;
}

function modeFault(jsonCount: number, rawCount: number): CliFailure | undefined {
  if (jsonCount > 1 || rawCount > 1) return failure("option-repeated", "Run check accepts each mode flag once.", 2);
  return jsonCount > 0 && rawCount > 0 ? failure("mode-conflict", "Run check does not combine JSON and raw modes.", 2) : undefined;
}

function positionals(args: readonly string[]): string[] | CliFailure {
  const found: string[] = [];
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at] ?? "";
    if (VALUED.includes(word)) at += 1;
    else if (word === "--json" || word === "-j" || word === "--raw") continue;
    else if (word.startsWith("-")) return failure("option-unknown", `Run check does not accept ${word}.`, 2);
    else found.push(word);
  }
  return found;
}

function selectorFault(stage: string | undefined, retry: number | undefined, repeat: number | undefined): CliFailure | undefined {
  if ((stage === undefined) !== (retry === undefined) || repeat !== undefined && stage === undefined) return failure("selector-partial", "Run check requires --stage and --retry together.", 2);
  return retry !== undefined && !positive(retry) || repeat !== undefined && !positive(repeat)
    ? failure("value-invalid", "Run check retry and repeat values must be positive integers.", 2) : undefined;
}

function queryFrom(values: {
  positional: string[]; json: boolean; raw: boolean; file: string | undefined; stage: string | undefined;
  retry: number | undefined; repeat: number | undefined;
}): Query {
  const query: Query = { run: values.positional[0] ?? "", check: values.positional[1] ?? "", json: values.json, raw: values.raw };
  if (values.file !== undefined) query.file = values.file;
  if (values.stage !== undefined) query.stage = values.stage;
  if (values.retry !== undefined) query.retry = values.retry;
  if (values.repeat !== undefined) query.repeat = values.repeat;
  return query;
}

function parse(args: string[]): Query | CliFailure {
  const badValue = valuedFault(args);
  if (badValue !== undefined) return badValue;
  const jsonCount = args.filter((word) => word === "--json" || word === "-j").length;
  const rawCount = args.filter((word) => word === "--raw").length;
  const badMode = modeFault(jsonCount, rawCount);
  if (badMode !== undefined) return badMode;
  const positional = positionals(args);
  if (!Array.isArray(positional)) return positional;
  if (positional.length !== 2) return failure("argument-invalid", "Run check requires one run and one check name.", 2);
  const stage = optionValues(args, "--stage")[0], retryRaw = optionValues(args, "--retry")[0], repeatRaw = optionValues(args, "--repeat")[0];
  const retry = retryRaw === undefined ? undefined : Number(retryRaw), repeat = repeatRaw === undefined ? undefined : Number(repeatRaw);
  const badSelector = selectorFault(stage, retry, repeat);
  if (badSelector !== undefined) return badSelector;
  return queryFrom({ positional, json: jsonCount === 1, raw: rawCount === 1,
    file: optionValues(args, "--file")[0], stage, retry, repeat });
}

function optionalPath(value: unknown): value is string | undefined { return value === undefined || normalized(value); }
function optionalDigest(value: unknown): value is string | undefined { return value === undefined || typeof value === "string" && /^[0-9a-f]{64}$/u.test(value); }
function optionalExit(value: unknown): value is number | null | undefined { return value === undefined || value === null || nonNegative(value); }
function optionalRepeat(value: unknown): value is number | undefined { return value === undefined || positive(value); }
function nullableNumber(value: number | null | undefined): number | null { return value === undefined ? null : value; }
function nullableString(value: string | undefined): string | null { return value === undefined ? null : value; }

function recording(event: Record<string, unknown>): Recording | undefined {
  const stage = event["stage"], retry = event["retry"], repeat = event["repeat"], exit = event["exit"];
  const file = event["file"], sha = event["sha256"], capture = event["capture"];
  if (typeof stage !== "string" || stage.length === 0 || !positive(retry)) return undefined;
  if (!optionalRepeat(repeat) || !optionalExit(exit)) return undefined;
  if (!normalized(capture) || !optionalPath(file) || !optionalDigest(sha)) return undefined;
  return { stage, repeat: nullableNumber(repeat), retry, exit: nullableNumber(exit), capture,
    executableFile: nullableString(file), executableSha256: nullableString(sha) };
}

function chosen(recordings: Recording[], query: Query): Recording[] {
  return recordings.filter((held) => (query.file === undefined || held.executableFile === query.file)
    && (query.stage === undefined || held.stage === query.stage && held.retry === query.retry
      && (query.repeat === undefined ? held.repeat === null : query.repeat === 1 ? held.repeat === null || held.repeat === 1 : held.repeat === query.repeat)));
}

function markdown(recordings: Recording[]): Buffer {
  const cell = (value: string | number | null): string => inertText(value === null ? "-" : String(value)).text;
  const rows = recordings.map((held) => `| ${cell(held.stage)} | ${cell(held.repeat)} | ${cell(held.retry)} | ${cell(held.exit)} | ${cell(held.capture)} | ${cell(held.executableFile)} | ${cell(held.executableSha256)} |`);
  return Buffer.from(["| Stage | Repeat | Retry | Exit | Capture | Executable file | Executable SHA-256 |", "| --- | ---: | ---: | ---: | --- | --- | --- |", ...rows, ""].join("\n"));
}

function rendered(run: string, name: string, recordings: Recording[], json: boolean): CommandResult {
  const stdout = json
    ? Buffer.from(`${jsonObject({ schemaVersion: 1, kind: "bot.run.check", data: { run, check: name, recordings } })}\n`)
    : markdown(recordings);
  return { exit: 0, stdout, stderr: Buffer.alloc(0) };
}

function rawSelection(recordings: Recording[], query: Query): Recording | CliFailure {
  if (query.stage !== undefined) return recordings.length === 1 ? recordings[0] ?? failure("selection-empty", "No check recording matches.", 1)
    : failure(recordings.length === 0 ? "selection-empty" : "selection-ambiguous", recordings.length === 0 ? "No check recording matches." : "More than one check recording matches.", 1);
  const successes = recordings.filter((held) => held.exit === 0), first = successes[0];
  if (first === undefined) return failure("selection-empty", "No successful check recording matches.", 1);
  const agrees = successes.every((held) => held.capture === first.capture && held.executableFile === first.executableFile
    && held.executableSha256 === first.executableSha256);
  return agrees ? first : failure("selection-disagrees", "Successful check recordings disagree.", 1);
}

async function selectedRecord(query: Query, home: string): Promise<{ name: string; directory: string; events: Record<string, unknown>[] } | CommandResult> {
  if (!lstatExists(home)) return newCommandFailure("run.check", failure("home-missing", `There is no bot home at ${home}.`, 1), query.json);
  const names = (await runNames(home)).filter((name) => name.startsWith(query.run));
  if (names.length !== 1) return newCommandFailure("run.check", failure(names.length === 0 ? "run-missing" : "run-ambiguous", names.length === 0 ? `No run's name starts with ${query.run}.` : `${String(names.length)} runs start with ${query.run}; give more of the name.`, 1), query.json);
  const name = names[0] ?? "", directory = join(home, "runs", name), record = await heldRecord(directory);
  if (record === undefined) return newCommandFailure("run.check", failure("record-missing", `Run ${name} has no record to read.`, 1), query.json);
  if (record.fault !== undefined) return newCommandFailure("run.check", failure("record-invalid", record.fault.says, 5), query.json);
  return { name, directory, events: record.events };
}

function filesystemFailure(query: Query, reason: unknown): CommandResult {
  const cause = errorCode(reason) ?? "filesystem-error";
  return newCommandFailure("run.check", failure(cause, `Run check could not inspect the Bot home (${cause}).`, 1), query.json);
}

async function safeSelectedRecord(query: Query, home: string): ReturnType<typeof selectedRecord> {
  return selectedRecord(query, home).then(
    (held) => held,
    (reason: unknown) => filesystemFailure(query, reason),
  );
}

function selectedRecordings(query: Query, name: string, events: Record<string, unknown>[]): Recording[] | CommandResult {
  const matching = events.filter((event) => event["event"] === "check" && event["check"] === query.check);
  const read = matching.map(recording);
  if (read.some((held) => held === undefined)) return newCommandFailure("run.check", failure("recording-invalid", `Run ${name} holds a malformed recording of check ${query.check}.`, 5), query.json);
  const filtered = chosen(read.filter((held): held is Recording => held !== undefined), query);
  if (matching.length === 0 || filtered.length === 0) return newCommandFailure("run.check", failure("selection-empty", `Run ${name} has no recording of check ${query.check}.`, 1), query.json);
  return filtered;
}

function rawDestination(boundary: Boundary): Writable {
  return boundary.rawStdout?.() ?? new Writable({
    write: (bytes: Buffer, _encoding, done) => { boundary.stdout(bytes); done(); },
  });
}

async function deliverRaw(bytes: Buffer, boundary: Boundary): Promise<CommandResult> {
  const opened = await Promise.resolve().then(() => rawDestination(boundary)).then(
    (destination) => ({ destination }),
    (reason: unknown) => ({ reason }),
  );
  const reason = "destination" in opened
    ? await pipeline(Readable.from([bytes]), opened.destination).then(() => undefined, (failed: unknown) => failed)
    : opened.reason;
  if (reason === undefined) return { exit: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
  const cause = errorCode(reason) ?? "operation failed";
  return newCommandFailure("run.check", failure("stdout-delivery", `Run check failed during stdout delivery (${cause}).`, 1), false);
}

async function execute(query: Query, home: string, boundary: Boundary): Promise<CommandResult> {
  const source = await safeSelectedRecord(query, home);
  if ("exit" in source) return source;
  const filtered = selectedRecordings(query, source.name, source.events);
  if (!Array.isArray(filtered)) return filtered;
  const { name, directory } = source;
  if (!query.raw) return rendered(name, query.check, filtered, query.json);
  const selected = rawSelection(filtered, query);
  if ("code" in selected) return newCommandFailure("run.check", selected, false);
  const capture = await boundedHeldRunFile(directory, selected.capture, RUN_CHECK_CAPTURE_BYTES);
  if (capture.kind !== "held") return newCommandFailure("run.check", failure("capture-unavailable", `Run ${name} cannot safely read ${selected.capture}.`, 5), false);
  return deliverRaw(capture.bytes, boundary);
}

export async function runCheckCommand(args: string[], boundary: Boundary): Promise<number> {
  const parsed = parse(args);
  if ("code" in parsed) {
    const json = args.includes("--json") || args.includes("-j");
    const held = newCommandFailure("run.check", parsed, json);
    boundary.stderr(held.stderr); return held.exit;
  }
  const taken = takeHome(args, boundary.cwd, boundary.env);
  if (taken.home === undefined) {
    const held = newCommandFailure("run.check", failure("value-missing", "Run check requires a value after --home.", 2), parsed.json);
    boundary.stderr(held.stderr); return held.exit;
  }
  const held = await execute(parsed, taken.home, boundary);
  if (held.stdout.length > 0) boundary.stdout(held.stdout);
  if (held.stderr.length > 0) boundary.stderr(held.stderr);
  return held.exit;
}
