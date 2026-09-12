import { resolve } from "node:path";
import { jsonObject } from "./check.ts";
import { HOME_RESULT_BYTES } from "./cli-contract.ts";
import { HomeInstallationError, readInstallation, type InstallationDependencies, type InstallationReading } from "./home-installation.ts";
import { inertText, newCommandFailure, type CommandResult } from "./new-command-result.ts";
import type { CliFailure } from "./run-list-query.ts";

interface Boundary { cwd: string; stdout(bytes: string | Uint8Array): void; stderr(bytes: string | Uint8Array): void }

function invalid(cause: string, message: string): CliFailure {
  return { code: "request-invalid", cause, message, retryable: false, details: {}, exit: 2 };
}

function parse(args: readonly string[], label: string): { home?: string; json: boolean; failure?: CliFailure } {
  const jsonOptions = args.filter((word) => word === "--json" || word === "-j");
  if (jsonOptions.length > 1) return { json: true, failure: invalid("option-repeated", `${label} accepts one JSON mode flag.`) };
  const indexes = args.flatMap((word, index) => word === "--home" ? [index] : []);
  if (indexes.length > 1) return { json: jsonOptions.length === 1, failure: invalid("option-repeated", `${label} accepts --home once.`) };
  const at = indexes[0], value = at === undefined ? undefined : args[at + 1];
  if (at === undefined) return { json: jsonOptions.length === 1, failure: invalid("option-required", `${label} requires --home DIR.`) };
  if (value === undefined || value.startsWith("-")) return { json: jsonOptions.length === 1, failure: invalid("value-missing", `${label} requires a value after --home.`) };
  if (value.length === 0) return { json: jsonOptions.length === 1, failure: invalid("value-empty", `${label} home must not be empty.`) };
  const consumed = new Set([at, at + 1, ...args.flatMap((word, index) => word === "--json" || word === "-j" ? [index] : [])]);
  const unknown = args.find((_word, index) => !consumed.has(index));
  return unknown === undefined
    ? { home: value, json: jsonOptions.length === 1 }
    : { json: jsonOptions.length === 1, failure: invalid("argument-unknown", `${label} does not accept ${unknown}.`) };
}

function failed(reason: unknown): CliFailure {
  if (reason instanceof HomeInstallationError) return {
    code: reason.exit === 3 ? "home-invalid" : reason.exit === 4 ? "dependency-failed" : "integrity-failed",
    cause: reason.causeCode, message: reason.message, retryable: reason.exit === 4,
    details: reason.published ? { publicationMayHaveCompleted: true } : {}, exit: reason.exit,
  };
  return { code: "integrity-failed", cause: "installation-failed", message: "The installation state could not be established safely.",
    retryable: false, details: {}, exit: 5 };
}

export function renderHomeResult(home: string, reading: InstallationReading, json: boolean): CommandResult {
  const data = { home, initialized: reading.initialized, ...(reading.initialized ? { installationId: reading.installationId } : {}) };
  const output = json
    ? `${jsonObject({ schemaVersion: 1, kind: "bot.home.show", data })}\n`
    : `# Bot home\n\n- Home: ${inertText(home, 3_000).text}\n- Initialized: ${reading.initialized ? "yes" : "no"}\n${reading.initialized ? `- Installation ID: ${reading.installationId}\n` : ""}`;
  if (Buffer.byteLength(output) > HOME_RESULT_BYTES) return newCommandFailure("home.show", {
    code: "integrity-failed", cause: "result-oversized", message: "The Bot home result exceeds its output bound.",
    retryable: false, details: {}, exit: 5,
  }, json);
  return { exit: 0, stdout: Buffer.from(output), stderr: Buffer.alloc(0) };
}

function requireInitializedResults(home: string, installationId: string): void {
  const reading = { initialized: true as const, installationId };
  const results = [false, true].map((json) => renderHomeResult(home, reading, json));
  if (results.some(({ exit }) => exit !== 0)) throw new HomeInstallationError("The Bot home result exceeds its output bound.", "result-oversized"); }

export function homeCommand(
  args: string[], boundary: Boundary, dependencies: InstallationDependencies = {},
): Promise<number> {
  const label = "Home show";
  const parsed = parse(args, label);
  if (parsed.failure !== undefined || parsed.home === undefined) {
    const result = newCommandFailure("home.show", parsed.failure ?? invalid("option-required", `${label} requires --home DIR.`), parsed.json);
    boundary.stderr(result.stderr); return Promise.resolve(result.exit);
  }
  const home = resolve(boundary.cwd, parsed.home);
  const storage = { ...dependencies, requireFeasible: (id: string) => { requireInitializedResults(home, id); } };
  return readInstallation(home, storage)
    .then((reading) => renderHomeResult(home, reading, parsed.json), (reason: unknown) => newCommandFailure("home.show", failed(reason), parsed.json))
    .then((result) => { if (result.stdout.length > 0) boundary.stdout(result.stdout); if (result.stderr.length > 0) boundary.stderr(result.stderr); return result.exit; });
}
