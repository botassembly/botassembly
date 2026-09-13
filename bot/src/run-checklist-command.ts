import { join } from "node:path";
import { jsonObject } from "./check.ts";
import { lstatExists } from "./documents.ts";
import { takeHome } from "./flags.ts";
import { runNames } from "./inspection.ts";
import { inertText, newCommandFailure, type CommandResult } from "./new-command-result.ts";
import { errorCode } from "./model.ts";
import { heldRecord } from "./record-lines.ts";
import type { CliFailure } from "./run-list-query.ts";

interface Boundary {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
}

interface Query {
  run: string;
  json: boolean;
  stage?: string;
  retry?: number;
  repeat?: number;
}

interface ChecklistMark {
  stage: string;
  repeat: number | null;
  retry: number;
  item: number;
  decision: "done" | "skipped";
  evidence: string | null;
  reason: string | null;
}

const VALUED = ["--home", "--stage", "--retry", "--repeat"];
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const optionalNonempty = (value: unknown): value is string | undefined => value === undefined || nonempty(value);
const markDecision = (value: unknown): value is ChecklistMark["decision"] => value === "done" || value === "skipped";

function failure(cause: string, message: string, exit: 1 | 2 | 5): CliFailure {
  return { code: exit === 2 ? "request-invalid" : exit === 5 ? "integrity-failed" : "home-not-found",
    cause, message, retryable: false, details: {}, exit };
}

function optionValues(args: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let at = 0; at < args.length; at += 1) if (args[at] === name && args[at + 1] !== undefined) values.push(args[at + 1] ?? "");
  return values;
}

function valuedFault(args: readonly string[]): CliFailure | undefined {
  for (const name of VALUED) {
    const count = args.filter((word) => word === name).length, value = optionValues(args, name)[0];
    if (count > 1) return failure("option-repeated", `Run checklist accepts ${name} once.`, 2);
    if (count === 1 && (value === undefined || value.startsWith("-"))) {
      return failure("value-missing", `Run checklist requires a value after ${name}.`, 2);
    }
  }
  return undefined;
}

function positionals(args: readonly string[]): string[] | CliFailure {
  const found: string[] = [];
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at] ?? "";
    if (VALUED.includes(word)) at += 1;
    else if (word === "--json" || word === "-j") continue;
    else if (word.startsWith("-")) return failure("option-unknown", `Run checklist does not accept ${word}.`, 2);
    else found.push(word);
  }
  return found;
}

function selectedInteger(args: readonly string[], name: string): number | undefined {
  const raw = optionValues(args, name)[0];
  if (raw === undefined || !/^[1-9]\d*$/u.test(raw)) return undefined;
  const value = Number(raw);
  return positive(value) ? value : undefined;
}

function modeFault(args: readonly string[]): CliFailure | undefined {
  return args.filter((word) => word === "--json" || word === "-j").length > 1
    ? failure("option-repeated", "Run checklist accepts one JSON mode flag.", 2) : undefined;
}

function selectorQuery(args: readonly string[]): Omit<Query, "run" | "json"> | CliFailure {
  const stage = optionValues(args, "--stage")[0];
  if (stage === "") return failure("value-invalid", "Run checklist stage must not be empty.", 2);
  const retryRaw = optionValues(args, "--retry")[0], repeatRaw = optionValues(args, "--repeat")[0];
  const retry = selectedInteger(args, "--retry"), repeat = selectedInteger(args, "--repeat");
  if (retryRaw !== undefined && retry === undefined) return failure("value-invalid", "Run checklist retry and repeat values must be positive integers.", 2);
  if (repeatRaw !== undefined && repeat === undefined) return failure("value-invalid", "Run checklist retry and repeat values must be positive integers.", 2);
  return { ...(stage === undefined ? {} : { stage }), ...(retry === undefined ? {} : { retry }),
    ...(repeat === undefined ? {} : { repeat }) };
}

function parse(args: string[]): Query | CliFailure {
  const badValue = valuedFault(args);
  if (badValue !== undefined) return badValue;
  const badMode = modeFault(args);
  if (badMode !== undefined) return badMode;
  const positional = positionals(args);
  if (!Array.isArray(positional)) return positional;
  if (positional.length !== 1) return failure("argument-invalid", "Run checklist requires one run.", 2);
  const selectors = selectorQuery(args);
  return "code" in selectors ? selectors
    : { run: positional[0] ?? "", json: args.includes("--json") || args.includes("-j"), ...selectors };
}

function markIdentity(event: Record<string, unknown>): Pick<ChecklistMark, "stage" | "repeat" | "retry" | "item"> | undefined {
  const stage = event["stage"], repeat = event["repeat"], retry = event["retry"], item = event["item"];
  if (!nonempty(stage)) return undefined;
  if (!positive(retry)) return undefined;
  if (!positive(item)) return undefined;
  if (repeat !== undefined && !positive(repeat)) return undefined;
  return { stage, repeat: repeat ?? null, retry, item };
}

function markContent(event: Record<string, unknown>): Pick<ChecklistMark, "decision" | "evidence" | "reason"> | undefined {
  const decision = event["decision"], evidence = event["evidence"], reason = event["reason"];
  if (!markDecision(decision)) return undefined;
  if (!optionalNonempty(evidence)) return undefined;
  if (!optionalNonempty(reason)) return undefined;
  if (decision === "skipped" && !nonempty(reason)) return undefined;
  return { decision, evidence: evidence ?? null, reason: reason ?? null };
}

function readMark(event: Record<string, unknown>): ChecklistMark | undefined {
  const identity = markIdentity(event), content = markContent(event);
  return identity === undefined || content === undefined ? undefined : { ...identity, ...content };
}

function selected(marks: ChecklistMark[], query: Query): ChecklistMark[] {
  return marks.filter((mark) => (query.stage === undefined || mark.stage === query.stage)
    && (query.retry === undefined || mark.retry === query.retry)
    && (query.repeat === undefined || mark.repeat === query.repeat));
}

function markdown(marks: ChecklistMark[]): Buffer {
  const cell = (value: string | number | null): string => inertText(value === null ? "-" : String(value)).text;
  const rows = marks.map((mark) => `| ${cell(mark.stage)} | ${cell(mark.repeat)} | ${cell(mark.retry)} | ${cell(mark.item)} | ${cell(mark.decision)} | ${cell(mark.evidence)} | ${cell(mark.reason)} |`);
  return Buffer.from(["| Stage | Repeat | Retry | Item | Decision | Evidence | Reason |", "| --- | ---: | ---: | ---: | --- | --- | --- |", ...rows, ""].join("\n"));
}

function rendered(run: string, marks: ChecklistMark[], json: boolean): CommandResult {
  const stdout = json
    ? Buffer.from(`${jsonObject({ schemaVersion: 1, kind: "bot.run.checklist", data: { run, marks } })}\n`)
    : markdown(marks);
  return { exit: 0, stdout, stderr: Buffer.alloc(0) };
}

async function selectedRecord(query: Query, home: string): Promise<{ name: string; events: Record<string, unknown>[] } | CommandResult> {
  if (!lstatExists(home)) return newCommandFailure("run.checklist", failure("home-missing", `There is no bot home at ${home}.`, 1), query.json);
  const names = (await runNames(home)).filter((name) => name.startsWith(query.run));
  if (names.length !== 1) return newCommandFailure("run.checklist", failure(names.length === 0 ? "run-missing" : "run-ambiguous",
    names.length === 0 ? `No run's name starts with ${query.run}.` : `${String(names.length)} runs start with ${query.run}; give more of the name.`, 1), query.json);
  const name = names[0] ?? "", record = await heldRecord(join(home, "runs", name));
  if (record === undefined) return newCommandFailure("run.checklist", failure("record-missing", `Run ${name} has no record to read.`, 1), query.json);
  if (record.fault !== undefined) return newCommandFailure("run.checklist", failure("record-invalid", record.fault.says, 5), query.json);
  return { name, events: record.events };
}

function filesystemFailure(query: Query, reason: unknown): CommandResult {
  const cause = errorCode(reason) ?? "filesystem-error";
  return newCommandFailure("run.checklist", failure(cause, `Run checklist could not inspect the Bot home (${cause}).`, 1), query.json);
}

async function execute(query: Query, home: string): Promise<CommandResult> {
  const source = await selectedRecord(query, home).then((held) => held, (reason: unknown) => filesystemFailure(query, reason));
  if ("exit" in source) return source;
  const events = source.events.filter((event) => event["event"] === "tool_call" && event["tool"] === "mark");
  const marks = events.map(readMark);
  if (marks.some((mark) => mark === undefined)) {
    return newCommandFailure("run.checklist", failure("mark-invalid", `Run ${source.name} holds a malformed checklist mark.`, 5), query.json);
  }
  const filtered = selected(marks.filter((mark): mark is ChecklistMark => mark !== undefined), query);
  return filtered.length > 0 ? rendered(source.name, filtered, query.json)
    : newCommandFailure("run.checklist", failure("selection-empty", `Run ${source.name} has no matching checklist marks.`, 1), query.json);
}

export async function runChecklistCommand(args: string[], boundary: Boundary): Promise<number> {
  const parsed = parse(args);
  if ("code" in parsed) {
    const held = newCommandFailure("run.checklist", parsed, args.includes("--json") || args.includes("-j"));
    boundary.stderr(held.stderr); return held.exit;
  }
  const taken = takeHome(args, boundary.cwd, boundary.env);
  if (taken.home === undefined) {
    const held = newCommandFailure("run.checklist", failure("value-missing", "Run checklist requires a value after --home.", 2), parsed.json);
    boundary.stderr(held.stderr); return held.exit;
  }
  const held = await execute(parsed, taken.home);
  if (held.stdout.length > 0) boundary.stdout(held.stdout);
  if (held.stderr.length > 0) boundary.stderr(held.stderr);
  return held.exit;
}
