import { jsonObject } from "./check.ts";
import { assemblyDependencyFailure } from "./assembly-command-failure.ts";
import { ASSEMBLY_REMOVE_CONTRACT } from "./cli-contract.ts";
import { takeHome } from "./flags.ts";
import { manage, type AssemblyRemoval, type ManagementResult } from "./management.ts";
import { errorCode, plainly } from "./model.ts";
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

interface ParsedRemoval { home: string; args: string[]; json: boolean }
const OPERATION = "assembly.remove";

function invalid(cause: string, message: string): CliFailure {
  return { code: "request-invalid", cause, message, retryable: false, details: {}, exit: 2 };
}

function refused(faults: readonly Refusal[]): CliFailure {
  const shown = faults.slice(0, 20).map((fault) => ({
    code: fault.code, path: boundedText(fault.path, 512), message: boundedText(fault.sentence, 512),
  }));
  return { code: "request-invalid", cause: "assembly-refused", message: "Assembly removal was refused.", retryable: false,
    details: { refusals: shown, omitted: faults.length - shown.length }, exit: 2 };
}

function dependency(reason: unknown): CliFailure {
  const cause = errorCode(reason) === "ELOCKED" ? "removal-busy" : "removal-failed";
  return assemblyDependencyFailure(reason, cause, "Assembly removal failed.");
}

function emitFailure(boundary: Boundary, failure: CliFailure, json: boolean): number {
  const output = newCommandFailure(OPERATION, failure, json);
  boundary.stderr(output.stderr);
  return output.exit;
}

function emitRefusal(boundary: Boundary, faults: readonly Refusal[], json: boolean): number {
  if (json) return emitFailure(boundary, refused(faults), true);
  const message = faults.flatMap((fault) => [`${fault.code}  ${plainly(fault.path)}`, `  ${plainly(fault.sentence)}`]).join("\n");
  boundary.stderr(`${boundedText(message, ASSEMBLY_REMOVE_CONTRACT.humanErrorBytes - 1)}\n`);
  return 2;
}

function document(removal: AssemblyRemoval): string {
  return `${jsonObject({ schemaVersion: 1, kind: "bot.assembly.remove", data: removal })}\n`;
}

function parse(args: string[], boundary: Boundary): ParsedRemoval | number {
  const modes = args.filter((word) => word === "--json" || word === "-j"), json = modes.length > 0;
  if (modes.length > 1) return emitFailure(boundary, invalid("option-repeated", "Assembly removal accepts one JSON mode flag."), json);
  if (args.filter((word) => word === "--home").length > 1) {
    return emitFailure(boundary, invalid("option-repeated", "Assembly removal accepts --home once."), json);
  }
  const held = takeHome(args.filter((word) => word !== "--json" && word !== "-j"), boundary.cwd, boundary.env);
  if (held.home === undefined) return emitFailure(boundary, invalid("value-missing", "Assembly removal requires a value after --home."), json);
  const name = held.args[0];
  if (name !== undefined && Buffer.byteLength(document({ name, kind: "installed", removed: true })) > ASSEMBLY_REMOVE_CONTRACT.resultBytes) {
    return emitFailure(boundary, invalid("result-oversized", "The assembly removal result exceeds its output bound."), json);
  }
  return { home: held.home, args: held.args, json };
}

function settled(parsed: ParsedRemoval, boundary: Boundary, result: ManagementResult): number {
  if (result.faults !== undefined) return emitRefusal(boundary, result.faults, parsed.json);
  if (result.removal === undefined) return emitFailure(boundary, dependency("Assembly removal changed state without a reportable result."), parsed.json);
  const output = parsed.json
    ? Buffer.from(document(result.removal))
    : Buffer.from(`${boundedText(plainly(result.lines[0] ?? ""), ASSEMBLY_REMOVE_CONTRACT.resultBytes - 1)}\n`);
  if (output.length > ASSEMBLY_REMOVE_CONTRACT.resultBytes) {
    return emitFailure(boundary, dependency("Assembly removal changed state without a reportable result."), parsed.json);
  }
  boundary.stdout(output);
  return result.exitCode;
}

export function assemblyRemoveCommand(args: string[], boundary: Boundary): number | Promise<number> {
  const parsed = parse(args, boundary);
  if (typeof parsed === "number") return parsed;
  return manage({ home: parsed.home, verb: "remove", args: parsed.args,
    cwd: boundary.cwd, env: boundary.env, clock: boundary.clock }).then(
    (result) => settled(parsed, boundary, result),
    (reason: unknown) => emitFailure(boundary, dependency(reason), parsed.json),
  );
}
