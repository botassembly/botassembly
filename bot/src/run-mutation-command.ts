import { refusalLines } from "./check.ts";
import { plainly } from "./model.ts";
import { newCommandFailure } from "./new-command-result.ts";
import { resumeOperation } from "./resume.ts";
import { resumeDependencies, runOperation, type RunCommandBoundary, type RunOperation } from "./run-command.ts";
import type { CliFailure } from "./run-list-query.ts";
import {
  parseRunResume, parseRunStart, renderRunStart, runMutationFailure, runMutationRefusal, type RunStartRequest,
} from "./run-start.ts";
import type { Refusal } from "./spine.ts";

interface Boundary extends RunCommandBoundary {
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
}

function usage(command: string, message: string, boundary: Boundary): number {
  boundary.stderr(`request-invalid  ${command}\n  ${message}\n`);
  return 2;
}

function writeFaults(boundary: Boundary, faults: readonly Refusal[], json: boolean): void {
  const text = json ? refusalLines([...faults]) : faults.flatMap((fault) => [`${fault.code}  ${fault.path}`, `  ${fault.sentence}`]);
  boundary.stderr(`${text.join("\n")}\n`);
}

function writeHumanRun(operation: RunOperation, json: boolean, boundary: Boundary): number {
  if (operation.kind === "usage") return usage(operation.command, operation.message, boundary);
  if (operation.kind === "faults") { writeFaults(boundary, operation.faults, json); return 2; }
  const result = operation.result;
  if (result.output !== undefined) boundary.stdout(result.output);
  if (result.exitCode !== 0) boundary.stderr(`${result.cause}${result.reason === undefined ? "" : `: ${plainly(result.reason.trimEnd())}`}\n`);
  return result.exitCode;
}

function prestartFailure(operationName: "run.start" | "run.resume", result: { exitCode: number; cause: string; reason?: string }): CliFailure {
  const integrity = result.exitCode === 5;
  return { code: integrity ? "integrity-failed" : "dependency-failed", cause: result.cause,
    message: result.reason ?? `${operationName} failed before the run began.`, retryable: !integrity,
    details: {}, exit: integrity ? 5 : 4 };
}

async function runMutation(
  args: string[], boundary: Boundary, operationName: "run.start" | "run.resume",
  parse: (args: readonly string[]) => RunStartRequest | { failure: CliFailure; json: boolean },
  execute: (parsed: RunStartRequest, boundary: Boundary) => Promise<RunOperation>,
): Promise<number> {
  const parsed = parse(args);
  if ("failure" in parsed) {
    const result = newCommandFailure(operationName, parsed.failure, parsed.json);
    boundary.stderr(result.stderr); return result.exit;
  }
  const runBoundary = parsed.json ? { ...boundary, stderrIsTTY: false } : boundary;
  const attempted = await execute(parsed, runBoundary).then((operation) => ({ operation }), (reason: unknown) => ({ reason }));
  if ("reason" in attempted) {
    const result = newCommandFailure(operationName, runMutationFailure(operationName, attempted.reason), parsed.json);
    boundary.stderr(result.stderr); return result.exit;
  }
  const { operation } = attempted;
  if (!parsed.json) return writeHumanRun(operation, false, boundary);
  if (operation.kind === "usage") {
    const failure = { code: "request-invalid", cause: "request-invalid", message: operation.message,
      retryable: false, details: {}, exit: 2 } satisfies CliFailure;
    const result = newCommandFailure(operationName, failure, true);
    boundary.stderr(result.stderr); return result.exit;
  }
  if (operation.kind === "faults") {
    const result = newCommandFailure(operationName, runMutationRefusal(operationName, operation.faults), true);
    boundary.stderr(result.stderr); return result.exit;
  }
  if (!("run" in operation.result)) {
    const failure = prestartFailure(operationName, operation.result);
    const result = newCommandFailure(operationName, failure, true);
    boundary.stderr(result.stderr); return result.exit;
  }
  const label = operationName === "run.start" ? "Run start" : "Run resume";
  const result = renderRunStart(operation.result, operationName, label);
  boundary.stdout(result.stdout);
  boundary.stderr(result.stderr);
  return result.exit;
}

export function runStartCommand(args: string[], boundary: Boundary): Promise<number> {
  return runMutation(args, boundary, "run.start", parseRunStart,
    (parsed, runBoundary) => runOperation(parsed.args, runBoundary, parsed.correlation));
}

export function runResumeCommand(args: string[], boundary: Boundary): Promise<number> {
  return runMutation(args, boundary, "run.resume", parseRunResume,
    (parsed, runBoundary) => resumeOperation(
      parsed.args, runBoundary, (idFile) => resumeDependencies(runBoundary, idFile), parsed.correlation,
    ));
}
