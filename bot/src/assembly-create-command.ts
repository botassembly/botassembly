import { jsonObject } from "./check.ts";
import { assemblyDependencyFailure } from "./assembly-command-failure.ts";
import { ASSEMBLY_CREATE_CONTRACT } from "./cli-contract.ts";
import { takeHome } from "./flags.ts";
import { AssemblyCreationFailure, assemblyCreationRequest, manage, type AssemblyCreation, type ManagementResult } from "./management.ts";
import { errorCode } from "./model.ts";
import { boundedText, newCommandFailure } from "./new-command-result.ts";
import type { DriverClock } from "./process.ts";
import type { CliFailure } from "./run-list-query.ts";
import type { Refusal } from "./spine.ts";

interface Boundary {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
  clock: DriverClock;
}

type Operation = "assembly.install" | "assembly.link";
interface ParsedCreation { home: string; args: string[]; json: boolean; link: boolean }

function invalid(cause: string, message: string): CliFailure {
  return { code: "request-invalid", cause, message, retryable: false, details: {}, exit: 2 };
}

function refused(faults: readonly Refusal[]): CliFailure {
  const shown = faults.slice(0, 20).map((fault) => ({
    code: fault.code, path: boundedText(fault.path, 512), message: boundedText(fault.sentence, 512),
  }));
  return { code: "request-invalid", cause: "assembly-refused", message: "Assembly creation was refused.", retryable: false,
    details: { refusals: shown, omitted: faults.length - shown.length }, exit: 2 };
}

function dependency(reason: unknown): CliFailure {
  return assemblyDependencyFailure(reason, errorCode(reason) === "ELOCKED" ? "creation-busy" : "creation-failed", "Assembly creation failed.");
}

function emitFailure(boundary: Boundary, operation: Operation, failure: CliFailure, json: boolean): number {
  const output = newCommandFailure(operation, failure, json);
  boundary.stderr(output.stderr);
  return output.exit;
}

function emitRefusal(boundary: Boundary, operation: Operation, faults: readonly Refusal[], json: boolean): number {
  if (json) return emitFailure(boundary, operation, refused(faults), true);
  const message = faults.flatMap((fault) => [`${fault.code}  ${fault.path}`, `  ${fault.sentence}`]).join("\n");
  boundary.stderr(`${boundedText(message, ASSEMBLY_CREATE_CONTRACT.humanErrorBytes - 1)}\n`);
  return 2;
}

function repeated(args: readonly string[], names: readonly string[]): boolean {
  return names.reduce((count, name) => count + args.filter((word) => word === name).length, 0) > 1;
}

function creationDocument(operation: Operation, creation: AssemblyCreation): string {
  return `${jsonObject({ schemaVersion: 1, kind: `bot.${operation}`, data: creation })}\n`;
}

function renderSuccess(operation: Operation, result: ManagementResult, json: boolean): Buffer | undefined {
  if (result.creation === undefined) return undefined;
  if (json) return Buffer.from(creationDocument(operation, result.creation));
  return Buffer.from(`${boundedText(result.lines[0] ?? "", ASSEMBLY_CREATE_CONTRACT.resultBytes - 1)}\n`);
}

function parseCreation(operation: Operation, args: string[], boundary: Boundary): ParsedCreation | number {
  const modes = args.filter((word) => word === "--json" || word === "-j"), json = modes.length > 0;
  if (modes.length > 1) return emitFailure(boundary, operation, invalid("option-repeated", "Assembly creation accepts one JSON mode flag."), json);
  if (repeated(args, ["--home"])) return emitFailure(boundary, operation, invalid("option-repeated", "Assembly creation accepts --home once."), json);
  if (repeated(args, ["--name"])) return emitFailure(boundary, operation, invalid("option-repeated", "Assembly creation accepts --name once."), json);
  const held = takeHome(args.filter((word) => word !== "--json" && word !== "-j"), boundary.cwd, boundary.env);
  if (held.home === undefined) return emitFailure(boundary, operation, invalid("value-missing", "Assembly creation requires a value after --home."), json);
  const link = operation === "assembly.link";
  const parsed = assemblyCreationRequest({ args: held.args, cwd: boundary.cwd }, link);
  if ("refusal" in parsed) return emitRefusal(boundary, operation, parsed.refusal.faults ?? [], json);
  const preview = creationDocument(operation, { name: parsed.name, kind: link ? "linked" : "installed", changed: true });
  if (Buffer.byteLength(preview) > ASSEMBLY_CREATE_CONTRACT.resultBytes) {
    return emitFailure(boundary, operation, invalid("result-oversized", "The assembly creation result exceeds its output bound."), json);
  }
  return { home: held.home, args: held.args, json, link };
}

function settled(operation: Operation, parsed: ParsedCreation, boundary: Boundary, result: ManagementResult): number {
  if (result.faults !== undefined) return emitRefusal(boundary, operation, result.faults, parsed.json);
  const output = renderSuccess(operation, result, parsed.json);
  if (output === undefined || output.length > ASSEMBLY_CREATE_CONTRACT.resultBytes) {
    return emitFailure(boundary, operation, dependency("Assembly creation published state without a reportable result."), parsed.json);
  }
  boundary.stdout(output);
  return result.exitCode;
}

export function assemblyCreateCommand(operation: Operation, args: string[], boundary: Boundary): number | Promise<number> {
  const parsed = parseCreation(operation, args, boundary);
  if (typeof parsed === "number") return parsed;
  return manage({ home: parsed.home, verb: parsed.link ? "link" : "install", args: parsed.args,
    cwd: boundary.cwd, env: boundary.env, clock: boundary.clock }).then(
      (result) => settled(operation, parsed, boundary, result),
    (reason: unknown) => {
      if (reason instanceof AssemblyCreationFailure) return settled(operation, parsed, boundary, reason.result);
      const failure = dependency(reason);
      return parsed.json || failure.code === "integrity-failed"
        ? emitFailure(boundary, operation, failure, parsed.json)
        : Promise.reject(reason instanceof Error ? reason : new Error("Assembly creation failed."));
    },
  );
}
