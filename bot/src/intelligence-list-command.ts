// Ticket 0297. The home's `intelligences` table, read and rendered. It loads
// no model runtime and reaches no network: the table is configuration, and
// `bot/src/home-config.ts` is the one reader of it. A missing `config.yaml`
// is an empty table rather than a fault, the way `readHome` treats it.
import { join, relative } from "node:path";
import { jsonObject } from "./check.ts";
import { INTELLIGENCE_LIST_CONTRACT } from "./cli-contract.ts";
import { lstatExists } from "./documents.ts";
import { takeHome } from "./flags.ts";
import { readYamlOptions } from "./home-config.ts";
import { bytewise, type IntelligenceTable } from "./model.ts";
import { inertText, newCommandFailure, type CommandResult } from "./new-command-result.ts";
import type { Refusal } from "./spine.ts";
import type { CliFailure, ErrorCause } from "./run-list-query.ts";
import type { IntelligenceListDocument } from "./command-document.ts";

interface Boundary {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
}

interface Request { home?: string; json: boolean; failure?: CliFailure }
interface Row { name: string; provider: string | null; model: string; reasoning: string }

function invalid(cause: ErrorCause, message: string, details: Record<string, unknown> = {}): CliFailure {
  return { code: "request-invalid", cause, message, retryable: false, details, exit: 2 };
}

function oversized(): CliFailure {
  return { code: "integrity-failed", cause: "result-oversized", retryable: false, details: {}, exit: 5,
    message: "The intelligence list result exceeds its output bound." };
}

/** Every malformed request, in the order `bot home busy` states them: a
 *  repeated flag, a `--home` whose value is another option, an unknown option,
 *  then a stray positional. */
function requestFault(args: readonly string[], jsonCount: number): CliFailure | undefined {
  if (jsonCount > 1) return invalid("option-repeated", "Intelligence list accepts one JSON mode flag.");
  if (args.filter((word) => word === "--home").length > 1) return invalid("option-repeated", "Intelligence list accepts --home once.");
  const homeAt = args.indexOf("--home"), rawHome = homeAt < 0 ? undefined : args[homeAt + 1];
  if (homeAt >= 0 && (rawHome === undefined || rawHome.startsWith("-"))) {
    return invalid("value-missing", "Intelligence list requires a value after --home.");
  }
  const rest = args.filter((_word, index) => index !== homeAt && (homeAt < 0 || index !== homeAt + 1))
    .filter((word) => word !== "--json" && word !== "-j");
  const unknown = rest.find((word) => word.startsWith("-"));
  if (unknown !== undefined) return invalid("option-unknown", `Intelligence list does not accept ${unknown}.`);
  const stray = rest[0];
  return stray === undefined ? undefined : invalid("argument-unknown", `Intelligence list does not accept ${stray}.`);
}

function parse(args: readonly string[], boundary: Pick<Boundary, "cwd" | "env">): Request {
  const jsonCount = args.filter((word) => word === "--json" || word === "-j").length;
  const json = jsonCount > 0;
  const fault = requestFault(args, jsonCount);
  if (fault !== undefined) return { json, failure: fault };
  const held = takeHome([...args], boundary.cwd, boundary.env);
  if (held.home === undefined) return { json, failure: invalid("value-missing", "Intelligence list requires a value after --home.") };
  return { home: held.home, json };
}

function rows(table: IntelligenceTable): Row[] {
  return Object.entries(table)
    .map(([name, bundle]) => ({ name, provider: bundle.provider ?? null, model: bundle.model, reasoning: bundle.reasoning }))
    .sort((first, second) => bytewise(first.name, second.name));
}

function cell(value: string | null): string {
  return inertText(value ?? "-").text;
}

function markdown(held: readonly Row[]): string {
  if (held.length === 0) return "# Intelligences\n";
  const body = held.map((row) => `| ${cell(row.name)} | ${cell(row.provider)} | ${cell(row.model)} | ${cell(row.reasoning)} |`);
  return ["# Intelligences", "", "| name | provider | model | reasoning |", "| --- | --- | --- | --- |", ...body, ""].join("\n");
}

function render(held: readonly Row[], json: boolean): CommandResult {
  const document = { schemaVersion: 1, kind: "bot.intelligence.list", data: [...held] } satisfies IntelligenceListDocument;
  const output = json ? `${jsonObject(document)}\n` : markdown(held);
  if (Buffer.byteLength(output) > INTELLIGENCE_LIST_CONTRACT.documentBytes) {
    return newCommandFailure("intelligence.list", oversized(), json);
  }
  return { exit: 0, stdout: Buffer.from(output), stderr: Buffer.alloc(0) };
}

/** The reader faults an absent source, so an absent file never reaches it
 *  (`bot/src/invocation.ts:393` guards the same way). */
function read(home: string, cwd: string): { table: IntelligenceTable; faults: Refusal[] } {
  const config = join(home, "config.yaml");
  if (!lstatExists(config)) return { table: {}, faults: [] };
  const faults: Refusal[] = [];
  return { table: readYamlOptions(config, relative(cwd, config), faults).intelligences, faults };
}

export function intelligenceListCommand(args: string[], boundary: Boundary): number {
  const request = parse(args, boundary);
  if (request.failure !== undefined || request.home === undefined) {
    const refusal = newCommandFailure("intelligence.list",
      request.failure ?? invalid("value-missing", "Intelligence list requires a home."), request.json);
    boundary.stderr(refusal.stderr);
    return refusal.exit;
  }
  const held = read(request.home, boundary.cwd);
  const result = held.faults.length > 0
    ? newCommandFailure("intelligence.list",
      invalid("home-invalid", "The home configuration is not valid.", { faults: held.faults }), request.json)
    : render(rows(held.table), request.json);
  if (result.stdout.length > 0) boundary.stdout(result.stdout);
  if (result.stderr.length > 0) boundary.stderr(result.stderr);
  return result.exit;
}
