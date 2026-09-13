import { RUN_SESSION_CONTRACT } from "./cli-contract.ts";
import { takeHome } from "./flags.ts";
import { output, type InspectionResult } from "./inspection.ts";
import { errorCode, plainly } from "./model.ts";
import { newCommandFailure, type CommandResult } from "./new-command-result.ts";
import { inspectSession } from "./one-run.ts";
import type { CliFailure } from "./run-list-query.ts";
import { validSessionCursor } from "./session-page.ts";

interface Boundary { cwd: string; env: NodeJS.ProcessEnv; stdout(bytes: string | Uint8Array): void; stderr(bytes: string | Uint8Array): void }
interface Query { run: string; stage: string; repeat?: number; limit: number; after?: string; raw: boolean }

const VALUED = ["--after", "--home", "--limit", "--repeat"] as const;

function failure(cause: string, message: string, exit: 1 | 2 | 3 | 4 | 5): CliFailure {
  return { code: exit === 2 ? "request-invalid" : exit === 3 ? "cursor-conflict" : exit === 5 ? "integrity-failed" : exit === 4 ? "dependency-failed" : "home-not-found",
    cause, message, retryable: exit === 4, details: {}, exit };
}

function value(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
}

function valued(word: string): boolean {
  return word === "--after" || word === "--home" || word === "--limit" || word === "--repeat";
}

function valuedFault(args: readonly string[]): CliFailure | undefined {
  for (const option of VALUED) {
    const count = args.filter((word) => word === option).length;
    const held = value(args, option);
    if (count > 1) return failure("option-repeated", `Run session accepts ${option} once.`, 2);
    if (count === 1 && (held === undefined || held.startsWith("-"))) return failure("value-missing", `Run session requires a value after ${option}.`, 2);
  }
  return undefined;
}

function positionals(args: readonly string[]): string[] | CliFailure {
  const found: string[] = [];
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at] ?? "";
    if (valued(word)) at += 1;
    else if (word === "--raw") continue;
    else if (word.startsWith("-")) return failure("option-unknown", `Run session does not accept ${word}.`, 2);
    else found.push(word);
  }
  return found;
}

function positive(raw: string | undefined, maximum?: number): number | undefined {
  if (raw === undefined || !/^[1-9]\d*$/u.test(raw)) return undefined;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && (maximum === undefined || parsed <= maximum) ? parsed : undefined;
}

function selectedNumbers(args: readonly string[]): { repeat?: number; limit: number } | CliFailure {
  const repeatRaw = value(args, "--repeat"), limitRaw = value(args, "--limit");
  const repeat = repeatRaw === undefined ? undefined : positive(repeatRaw);
  const limit = limitRaw === undefined ? RUN_SESSION_CONTRACT.pageDefault : positive(limitRaw, RUN_SESSION_CONTRACT.pageMaximum);
  if ((repeatRaw !== undefined && repeat === undefined) || limit === undefined) return failure("value-invalid", "Run session repeat and limit values must be positive integers within their published bounds.", 2);
  return { ...(repeat === undefined ? {} : { repeat }), limit };
}

function modeFault(args: readonly string[], rawCount: number, after: string | undefined): CliFailure | undefined {
  if (rawCount > 1) return failure("option-repeated", "Run session accepts --raw once.", 2);
  if (rawCount === 1 && (value(args, "--limit") !== undefined || after !== undefined)) return failure("option-conflict", "Run session raw mode does not accept --limit or --after.", 2);
  return after !== undefined && !validSessionCursor(after)
    ? failure("cursor-invalid", "Run session requires a valid bounded cursor after --after.", 2) : undefined;
}

function parse(args: readonly string[]): Query | CliFailure {
  const badValue = valuedFault(args);
  if (badValue !== undefined) return badValue;
  const rawCount = args.filter((word) => word === "--raw").length;
  const held = positionals(args);
  if (!Array.isArray(held)) return held;
  if (held.length !== 2 || held.some((word) => word.length === 0)) return failure("argument-invalid", "Run session requires one run and one stage.", 2);
  const after = value(args, "--after"), badMode = modeFault(args, rawCount, after);
  if (badMode !== undefined) return badMode;
  const numbers = selectedNumbers(args);
  return "code" in numbers ? numbers : { run: held[0] ?? "", stage: held[1] ?? "", ...numbers,
    ...(after === undefined ? {} : { after }), raw: rawCount === 1 };
}

function typedFailure(reading: InspectionResult): CommandResult {
  const cause = reading.cause ?? "selection-missing";
  const exit = cause.startsWith("cursor-") ? 3
    : cause === "record-invalid" || cause === "session-invalid" || cause === "session-too-large" ? 5 : 1;
  const message = reading.diagnostics?.map(plainly).join(" ") ?? "The requested session is unavailable.";
  return newCommandFailure("run.session", failure(cause, message, exit), false);
}

function rendered(query: Query, reading: InspectionResult): CommandResult {
  if (reading.cause !== undefined || reading.exitCode !== 0) return typedFailure(reading);
  const stderr = reading.diagnostics === undefined ? Buffer.alloc(0) : output(reading.diagnostics.map(plainly));
  return { exit: 0, stdout: reading.output, stderr };
}

function filesystemFailure(reason: unknown): CommandResult {
  const cause = errorCode(reason) ?? "filesystem-error";
  return newCommandFailure("run.session", failure(cause, `Run session could not inspect the Bot home (${cause}).`, 4), false);
}

function write(boundary: Boundary, result: CommandResult): Promise<number> {
  const attempted = Promise.resolve().then(() => {
    if (result.stdout.length > 0) boundary.stdout(result.stdout);
    if (result.stderr.length > 0) boundary.stderr(result.stderr);
    return result.exit;
  });
  return attempted.then((exit) => exit, (reason: unknown) => {
    const cause = errorCode(reason) ?? "output-error";
    const failed = newCommandFailure("run.session", failure(cause, `Run session could not write its result (${cause}).`, 4), false);
    const diagnostic = Promise.resolve().then(() => { boundary.stderr(failed.stderr); });
    return diagnostic.then(() => 4, () => 4);
  });
}

export async function runSessionCommand(args: string[], boundary: Boundary): Promise<number> {
  const parsed = parse(args);
  if ("code" in parsed) return write(boundary, newCommandFailure("run.session", parsed, false));
  const taken = takeHome(args, boundary.cwd, boundary.env);
  if (taken.home === undefined) return write(boundary, newCommandFailure("run.session", failure("value-missing", "Run session requires a value after --home.", 2), false));
  const reading = await inspectSession(taken.home, parsed.run, parsed.stage, parsed.repeat, parsed.raw,
    parsed.raw ? undefined : { limit: parsed.limit, ...(parsed.after === undefined ? {} : { after: parsed.after }) })
    .then((held) => rendered(parsed, held), (reason: unknown) => filesystemFailure(reason));
  return write(boundary, reading);
}
