import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { jsonObject } from "./check.ts";
import { childRecordAgrees } from "./child-record.ts";
import { RUN_EVENTS_CONTRACT } from "./cli-contract.ts";
import { takeHome } from "./flags.ts";
import { runNames } from "./inspection.ts";
import { scratchRoot } from "./invocation.ts";
import { errorCode } from "./model.ts";
import { newCommandFailure, type CommandResult } from "./new-command-result.ts";
import { childReference, showRecord } from "./one-run.ts";
import { heldRecord, type HeldRecord } from "./record-lines.ts";
import type { CliFailure } from "./run-list-query.ts";

interface Boundary { cwd: string; env: NodeJS.ProcessEnv; resultBytesExclusive?: number; stdout(bytes: string | Uint8Array): void; stderr(bytes: string | Uint8Array): void }
interface Query { run: string; child?: string; json: boolean }
interface Selected { home: string; name: string; directory: string; child: string | null; record: HeldRecord }
type DirectoryState = "directory" | "missing" | "invalid";

const VALUED = ["--child", "--home"] as const;

function failure(cause: string, message: string, exit: 1 | 2 | 4 | 5): CliFailure {
  return { code: exit === 2 ? "request-invalid" : exit === 5 ? "integrity-failed" : exit === 4 ? "dependency-failed" : "home-not-found",
    cause, message, retryable: exit === 4, details: {}, exit };
}

function value(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
}

function valuedFault(args: readonly string[]): CliFailure | undefined {
  for (const option of VALUED) {
    const count = args.filter((word) => word === option).length;
    const held = value(args, option);
    if (count > 1) return failure("option-repeated", `Run events accepts ${option} once.`, 2);
    if (count === 1 && (held === undefined || held.startsWith("-"))) return failure("value-missing", `Run events requires a value after ${option}.`, 2);
  }
  return undefined;
}

function valued(word: string): boolean {
  return word === "--child" || word === "--home";
}

function positionals(args: readonly string[]): string[] | CliFailure {
  const found: string[] = [];
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at] ?? "";
    if (valued(word)) at += 1;
    else if (word === "--json" || word === "-j") continue;
    else if (word.startsWith("-")) return failure("option-unknown", `Run events does not accept ${word}.`, 2);
    else found.push(word);
  }
  return found;
}

function parse(args: readonly string[]): Query | CliFailure {
  const badValue = valuedFault(args);
  if (badValue !== undefined) return badValue;
  const modes = args.filter((word) => word === "--json" || word === "-j");
  if (modes.length > 1) return failure("option-repeated", "Run events accepts one JSON mode flag.", 2);
  const positional = positionals(args);
  if (!Array.isArray(positional)) return positional;
  if (positional.length !== 1) return failure("argument-invalid", "Run events requires one run.", 2);
  const child = value(args, "--child");
  if (child !== undefined && !childReference(child)) return failure("child-invalid", "Run events requires a normalized recorded child reference.", 2);
  return { run: positional[0] ?? "", ...(child === undefined ? {} : { child }), json: modes.length === 1 };
}

function directoryState(path: string): Promise<DirectoryState> {
  return lstat(path).then(
    (stat) => stat.isDirectory() ? "directory" : "invalid",
    (reason: unknown) => errorCode(reason) === "ENOENT" ? "missing" : Promise.reject(reason instanceof Error ? reason : new Error("Filesystem inspection failed.")),
  );
}

function storageFailure(query: Query, home: string, state: DirectoryState, part: "home" | "runs"): CommandResult | undefined {
  if (state === "directory") return undefined;
  if (part === "home" && state === "missing") {
    return newCommandFailure("run.events", failure("home-missing", `There is no bot home at ${home}.`, 1), query.json);
  }
  if (part === "runs" && state === "missing") {
    return newCommandFailure("run.events", failure("run-missing", `No run's name starts with ${query.run}.`, 1), query.json);
  }
  const cause = part === "home" ? "home-invalid" : "runs-invalid";
  const message = part === "home" ? `The Bot home at ${home} is not a directory.` : `The runs path in ${home} is not a directory.`;
  return newCommandFailure("run.events", failure(cause, message, 4), query.json);
}

async function root(query: Query, home: string): Promise<Selected | CommandResult> {
  const homeState = await directoryState(home);
  const badHome = storageFailure(query, home, homeState, "home");
  if (badHome !== undefined) return badHome;
  const runsState = await directoryState(join(home, "runs"));
  const badRuns = storageFailure(query, home, runsState, "runs");
  if (badRuns !== undefined) return badRuns;
  const names = (await runNames(home)).filter((name) => name.startsWith(query.run));
  if (names.length !== 1) return newCommandFailure("run.events", failure(names.length === 0 ? "run-missing" : "run-ambiguous",
    names.length === 0 ? `No run's name starts with ${query.run}.` : `${String(names.length)} runs start with ${query.run}; give more of the name.`, 1), query.json);
  const name = names[0] ?? "", directory = join(home, "runs", name);
  const record = await heldRecord(directory);
  if (record === undefined) return newCommandFailure("run.events", failure("record-missing", `Run ${name} has no record to read.`, 1), query.json);
  if (record.fault !== undefined) return newCommandFailure("run.events", failure("record-invalid", record.fault.says, 5), query.json);
  return { home, name, directory, child: null, record };
}

async function selected(query: Query, home: string): Promise<Selected | CommandResult> {
  const parent = await root(query, home);
  if ("exit" in parent || query.child === undefined) return parent;
  const call = parent.record.events.find((event) => event["event"] === "subflow_call" && event["started"] === true && event["child"] === query.child);
  if (call === undefined) return newCommandFailure("run.events", failure("child-unrecorded", "The parent run does not record that child.", 1), query.json);
  const record = await heldRecord(parent.directory, `${query.child}/record.jsonl`);
  if (record === undefined) return newCommandFailure("run.events", failure("child-missing", "The recorded child is unavailable.", 1), query.json);
  if (record.fault !== undefined) return newCommandFailure("run.events", failure("child-invalid", record.fault.says, 5), query.json);
  if (!await childRecordAgrees(parent.directory, query.child, call, record)) {
    return newCommandFailure("run.events", failure("child-disagrees", "The recorded child does not agree with its parent record.", 5), query.json);
  }
  return { ...parent, child: query.child, record, directory: join(parent.directory, ...query.child.split("/")) };
}

function render(query: Query, held: Selected, env: NodeJS.ProcessEnv, resultBytesExclusive: number): CommandResult {
  const stdout = query.json
    ? Buffer.from(`${jsonObject({ schemaVersion: 1, kind: "bot.run.events", data: { run: held.name, child: held.child, events: held.record.events } })}\n`)
    : showRecord(held.home, held.directory, held.record, false, scratchRoot(env)).output;
  if (stdout.length >= resultBytesExclusive) {
    return newCommandFailure("run.events", failure("result-too-large", "The complete record reading exceeds the output limit.", 5), query.json);
  }
  return { exit: 0, stdout, stderr: Buffer.alloc(0) };
}

function filesystemFailure(query: Query, reason: unknown): CommandResult {
  const cause = errorCode(reason) ?? "filesystem-error";
  return newCommandFailure("run.events", failure(cause, `Run events could not inspect the Bot home (${cause}).`, 4), query.json);
}

function write(boundary: Boundary, query: Query, result: CommandResult): Promise<number> {
  const attempted = Promise.resolve().then(() => {
    if (result.stdout.length > 0) boundary.stdout(result.stdout);
    if (result.stderr.length > 0) boundary.stderr(result.stderr);
    return result.exit;
  });
  return attempted.then((exit) => exit, (reason: unknown) => {
    const cause = errorCode(reason) ?? "output-error";
    const failed = newCommandFailure("run.events", failure(cause, `Run events could not write its result (${cause}).`, 4), query.json);
    const diagnostic = Promise.resolve().then(() => { boundary.stderr(failed.stderr); });
    return diagnostic.then(() => 4, () => 4);
  });
}

export async function runEventsCommand(args: string[], boundary: Boundary): Promise<number> {
  const parsed = parse(args);
  if ("code" in parsed) return write(boundary, { run: "", json: args.includes("--json") || args.includes("-j") }, newCommandFailure("run.events", parsed, args.includes("--json") || args.includes("-j")));
  const taken = takeHome(args, boundary.cwd, boundary.env);
  if (taken.home === undefined) return write(boundary, parsed, newCommandFailure("run.events", failure("value-missing", "Run events requires a value after --home.", 2), parsed.json));
  const held = await selected(parsed, taken.home).then((found) => found, (reason: unknown) => filesystemFailure(parsed, reason));
  return write(boundary, parsed, "exit" in held ? held : render(parsed, held, boundary.env, boundary.resultBytesExclusive ?? RUN_EVENTS_CONTRACT.resultBytesExclusive));
}
