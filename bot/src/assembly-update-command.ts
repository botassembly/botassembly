import { jsonObject } from "./check.ts";
import { ASSEMBLY_UPDATE_CONTRACT } from "./cli-contract.ts";
import { takeHome } from "./flags.ts";
import { holdsNone } from "./inspection.ts";
import { AssemblyUpdateFailure, manage, type AssemblyUpdateOutcome, type AssemblyUpdateSelection, type ManagementResult } from "./management.ts";
import { errorCode } from "./model.ts";
import { boundedText, inertText, newCommandFailure } from "./new-command-result.ts";
import type { DriverClock } from "./process.ts";
import type { CliFailure } from "./run-list-query.ts";

interface Boundary {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
  clock: DriverClock;
  afterAssemblyUpdateAside?: () => Promise<void>;
  afterAssemblyUpdateSelection?: () => Promise<void>;
  afterAssemblyUpdatePublish?: () => Promise<void>;
}

interface ParsedUpdate { home: string; args: string[]; json: boolean }

function invalid(cause: string, message: string): CliFailure {
  return { code: "request-invalid", cause, message, retryable: false, details: {}, exit: 2 };
}

function emitFailure(boundary: Boundary, failure: CliFailure, json: boolean): number {
  const output = newCommandFailure("assembly.update", failure, json);
  boundary.stderr(output.stderr);
  return output.exit;
}

function dependency(reason: unknown): CliFailure {
  return {
    code: "dependency-failed", cause: errorCode(reason) === "ELOCKED" ? "update-busy" : "update-failed",
    message: reason instanceof Error ? reason.message : "Assembly update failed.", retryable: true, details: {}, exit: 4,
  };
}

function document(outcomes: readonly AssemblyUpdateOutcome[]): string {
  return `${jsonObject({ schemaVersion: 1, kind: "bot.assembly.update", data: { outcomes } })}\n`;
}

function worstCase(names: readonly string[]): number {
  const reason = "\0".repeat(ASSEMBLY_UPDATE_CONTRACT.reasonBytes);
  return Buffer.byteLength(document(names.map((name) => ({ name, state: "unchanged" as const, reason }))));
}

class ResultOversizedError extends Error {}

function validateSelection(selection: AssemblyUpdateSelection): void {
  const names = "refusal" in selection ? selection.refusal.updates?.map((outcome) => outcome.name) ?? [] : selection.names;
  if (worstCase(names) > ASSEMBLY_UPDATE_CONTRACT.resultBytes) throw new ResultOversizedError();
}

function parse(args: string[], boundary: Boundary): ParsedUpdate | number {
  const modes = args.filter((word) => word === "--json" || word === "-j");
  const json = modes.length > 0;
  if (modes.length > 1) return emitFailure(boundary, invalid("option-repeated", "Assembly update accepts one JSON mode flag."), json);
  if (args.filter((word) => word === "--home").length > 1) return emitFailure(boundary, invalid("option-repeated", "Assembly update accepts --home once."), json);
  const held = takeHome(args.filter((word) => word !== "--json" && word !== "-j"), boundary.cwd, boundary.env);
  if (held.home === undefined) return emitFailure(boundary, invalid("value-missing", "Assembly update requires a value after --home."), json);
  if (held.args.length > 1 || held.args.some((word) => word.startsWith("--"))) {
    return emitFailure(boundary, invalid("arguments-invalid", "Give at most one assembly name."), json);
  }
  return { home: held.home, args: held.args, json };
}

function boundedOutcomes(result: ManagementResult): AssemblyUpdateOutcome[] {
  return (result.updates ?? []).map((outcome) => ({
    ...outcome, reason: boundedText(outcome.reason, ASSEMBLY_UPDATE_CONTRACT.reasonBytes),
  }));
}

function settled(parsed: ParsedUpdate, boundary: Boundary, result: ManagementResult): number {
  const outcomes = boundedOutcomes(result);
  if (parsed.json) {
    const output = Buffer.from(document(outcomes));
    if (output.length > ASSEMBLY_UPDATE_CONTRACT.resultBytes) {
      return emitFailure(boundary, invalid("result-oversized", "The assembly update result exceeds its output bound."), true);
    }
    boundary.stdout(output);
  } else {
    if (result.lines.length > 0) boundary.stdout(`${result.lines.join("\n")}\n`);
    if (result.faults !== undefined) {
      const shown = result.faults.flatMap((fault) => [`${fault.code}  ${fault.path}`, `  ${fault.sentence}`]).join("\n");
      boundary.stderr(`${boundedText(shown, ASSEMBLY_UPDATE_CONTRACT.humanErrorBytes - 1)}\n`);
    } else if (result.updateTrouble !== undefined) {
      boundary.stderr(`${inertText(`${result.updateTrouble.name}  update failed\n  ${result.updateTrouble.reason}`, ASSEMBLY_UPDATE_CONTRACT.humanErrorBytes - 1).text}\n`);
    } else if (result.exitCode === 1) boundary.stderr(`${holdsNone(parsed.home, "assemblies")}\n`);
  }
  return result.exitCode;
}

function runUpdate(parsed: ParsedUpdate, boundary: Boundary): Promise<number> {
  return manage({
    home: parsed.home, verb: "update", args: parsed.args, cwd: boundary.cwd, env: boundary.env, clock: boundary.clock,
    ...(boundary.afterAssemblyUpdateAside === undefined ? {} : { afterAssemblyUpdateAside: boundary.afterAssemblyUpdateAside }),
    ...(boundary.afterAssemblyUpdateSelection === undefined ? {} : { afterAssemblyUpdateSelection: boundary.afterAssemblyUpdateSelection }),
    ...(boundary.afterAssemblyUpdatePublish === undefined ? {} : { afterAssemblyUpdatePublish: boundary.afterAssemblyUpdatePublish }),
    validateAssemblyUpdateSelection: validateSelection,
  }).then(
    (result) => settled(parsed, boundary, result),
    (reason: unknown) => {
      if (reason instanceof AssemblyUpdateFailure) return settled(parsed, boundary, reason.result);
      if (reason instanceof ResultOversizedError) {
        return emitFailure(boundary, invalid("result-oversized", "The assembly update result exceeds its output bound."), parsed.json);
      }
      return emitFailure(boundary, dependency(reason), parsed.json);
    },
  );
}

export function assemblyUpdateCommand(args: string[], boundary: Boundary): Promise<number> {
  const json = args.some((word) => word === "--json" || word === "-j");
  return Promise.resolve().then(() => parse(args, boundary)).then(
    (parsed) => typeof parsed === "number" ? parsed : runUpdate(parsed, boundary),
    (reason: unknown) => emitFailure(boundary, dependency(reason), json),
  );
}
