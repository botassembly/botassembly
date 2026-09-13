import { isUtf8 } from "node:buffer";
import { jsonObject } from "./check.ts";
import { RUN_RESUME_OPTIONS, RUN_START_CONTRACT, RUN_START_OPTIONS, type CliOptionDescriptor } from "./cli-contract.ts";
import { errorCode } from "./model.ts";
import { boundedText, newCommandFailure, type CommandResult } from "./new-command-result.ts";
import type { StartedRunResult } from "./run.ts";
import type { CliFailure } from "./run-list-query.ts";
import type { Refusal } from "./spine.ts";

export type RunStartRequest = { args: string[]; json: boolean; correlation?: string };

function invalid(cause: string, message: string): CliFailure {
  return { code: "request-invalid", cause, message, retryable: false, details: {}, exit: 2 };
}

export function runMutationFailure(operation: string, reason: unknown): CliFailure {
  return {
    code: "dependency-failed", cause: errorCode(reason) ?? "dependency-failed",
    message: reason instanceof Error ? reason.message : `${operation} failed before the run began.`,
    retryable: true, details: {}, exit: 4,
  };
}

export function runMutationRefusal(operation: string, faults: readonly Refusal[]): CliFailure {
  const refusals = faults.slice(0, 20).map((fault) => ({
    code: fault.code, path: boundedText(fault.path, 512), message: boundedText(fault.sentence, 512),
  }));
  return {
    code: "request-invalid", cause: "run-refused", message: `${operation} was refused.`,
    retryable: false, details: { refusals, omitted: faults.length - refusals.length }, exit: 2,
  };
}

function valueOption(args: readonly string[], name: string): { indexes: number[]; value?: string; missing: boolean } {
  const indexes = args.flatMap((word, at) => word === name ? [at] : []);
  const next = indexes[0] === undefined ? undefined : args[indexes[0] + 1];
  return { indexes, ...(next === undefined || next.startsWith("-") ? {} : { value: next }), missing: indexes.length > 0 && (next === undefined || next.startsWith("-")) };
}

function outputMode(args: readonly string[], label: string): { indexes: number[]; json: boolean; failure?: CliFailure } {
  const indexes = args.flatMap((word, at) => word === "--json" || word === "-j" ? [at] : []);
  return indexes.length > 1
    ? { indexes, json: true, failure: invalid("option-repeated", `${label} accepts one JSON mode flag.`) }
    : { indexes, json: indexes.length === 1 };
}

function correlationFailure(held: ReturnType<typeof valueOption>, label: string): CliFailure | undefined {
  if (held.indexes.length > 1) return invalid("option-repeated", `${label} accepts --correlation once.`);
  if (held.missing) return invalid("value-missing", `${label} requires a value after --correlation.`);
  if (held.value !== undefined && Buffer.byteLength(held.value) > RUN_START_CONTRACT.correlationBytes) {
    return invalid("value-oversized", `${label} correlation exceeds 256 UTF-8 bytes.`);
  }
  return held.value === "" ? invalid("value-empty", `${label} correlation must not be empty.`) : undefined;
}

function repeatedFixedOption(args: readonly string[], options: readonly CliOptionDescriptor[]): string | undefined {
  return options.find((option) => !option.repeatable
    && [option.name, ...option.aliases].reduce((count, name) => count + args.filter((word) => word === name).length, 0) > 1)?.name;
}

function parseRunMutation(
  args: readonly string[], label: string, options: readonly CliOptionDescriptor[],
): RunStartRequest | { failure: CliFailure; json: boolean } {
  const marker = args.indexOf("--");
  const controls = marker < 0 ? args : args.slice(0, marker);
  const suffix = marker < 0 ? [] : args.slice(marker);
  const mode = outputMode(controls, label), json = mode.json;
  if (mode.failure !== undefined) return { failure: mode.failure, json };
  const repeated = repeatedFixedOption(controls, options);
  if (repeated !== undefined) return { failure: invalid("option-repeated", `${label} accepts ${repeated} once.`), json };
  const correlation = valueOption(controls, "--correlation");
  const invalidCorrelation = correlationFailure(correlation, label);
  if (invalidCorrelation !== undefined) return { failure: invalidCorrelation, json };
  const removed = new Set(mode.indexes);
  for (const at of correlation.indexes) { removed.add(at); removed.add(at + 1); }
  return {
    args: [...controls.filter((_, at) => !removed.has(at)), ...suffix],
    json,
    ...(correlation.value === undefined ? {} : { correlation: correlation.value }),
  };
}

export function parseRunStart(args: readonly string[]): ReturnType<typeof parseRunMutation> {
  return parseRunMutation(args, "Run start", RUN_START_OPTIONS);
}

export function parseRunResume(args: readonly string[]): ReturnType<typeof parseRunMutation> {
  const parsed = parseRunMutation(args, "Run resume", RUN_RESUME_OPTIONS);
  if (args.includes("--") && !("failure" in parsed)) {
    return { failure: invalid("option-invalid", "Run resume does not accept --."), json: parsed.json };
  }
  return parsed;
}

function reasonDescriptor(reason: string): { text: string; bytes: number; truncated: boolean } {
  const bytes = Buffer.from(reason);
  if (bytes.length <= RUN_START_CONTRACT.reasonBytes) return { text: reason, bytes: bytes.length, truncated: false };
  let end: number = RUN_START_CONTRACT.reasonBytes;
  while (!isUtf8(bytes.subarray(0, end))) end -= 1;
  return { text: bytes.subarray(0, end).toString("utf8"), bytes: bytes.length, truncated: true };
}

function outputDescriptor(result: StartedRunResult, include: boolean): Record<string, unknown> | undefined {
  const source = result.outputSource, bytes = result.output;
  if (source === undefined || bytes === undefined) return undefined;
  const utf8 = isUtf8(bytes);
  return {
    path: source.record.path,
    extension: source.extension,
    bytes: bytes.length,
    sha256: source.record.sha256,
    contentIncluded: include,
    ...(include ? { encoding: utf8 ? "utf8" : "base64", content: utf8 ? bytes.toString("utf8") : bytes.toString("base64") } : {}),
  };
}

function resultData(result: StartedRunResult, content: boolean, identities: boolean): Record<string, unknown> {
  const output = outputDescriptor(result, content);
  const carried = result.carried === undefined ? undefined : {
    count: result.carried.length, identitiesIncluded: identities,
    ...(identities ? { identities: result.carried } : {}),
  };
  return {
    run: result.run,
    startedAt: result.startedAt,
    installationId: result.installationId,
    complete: result.ending !== undefined,
    exit: result.exitCode,
    cause: result.cause,
    ...(result.ending === undefined ? {} : { endedAt: result.ending.ts }),
    ...(result.reason === undefined ? {} : { reason: reasonDescriptor(result.reason) }),
    ...(result.terminalStage === undefined ? {} : { terminalStage: result.terminalStage }),
    ...(result.correlation === undefined ? {} : { correlation: result.correlation }),
    ...(result.donor === undefined ? {} : { donor: result.donor }),
    ...(carried === undefined ? {} : { carried }),
    ...(output === undefined ? {} : { output }),
  };
}

function document(result: StartedRunResult, content: boolean, identities: boolean): Buffer {
  return Buffer.from(`${jsonObject({ schemaVersion: 1, kind: RUN_START_CONTRACT.result.kind, data: resultData(result, content, identities) })}\n`);
}

export function renderRunStart(
  result: StartedRunResult, operation = "run.start", label = "Run start",
): CommandResult<number> {
  const complete = document(result, true, true);
  const descriptor = complete.length <= RUN_START_CONTRACT.resultBytes ? complete : document(result, false, true);
  const stdout = descriptor.length <= RUN_START_CONTRACT.resultBytes ? descriptor : document(result, false, false);
  if (stdout.length > RUN_START_CONTRACT.resultBytes) {
    return newCommandFailure(operation, {
      code: "integrity-failed", cause: "result-oversized", message: `${label} result exceeds its output bound.`,
      retryable: false, details: {}, exit: 5,
    }, true);
  }
  return { exit: result.exitCode, stdout, stderr: Buffer.alloc(0) };
}
