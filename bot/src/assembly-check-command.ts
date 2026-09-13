import { parseDocument } from "yaml";
import { hashBytes } from "./record.ts";
import { jsonObject } from "./check.ts";
import { readInvocationTokens, type CheckResult } from "./reader.ts";
import { takeHome } from "./flags.ts";
import { ASSEMBLY_READ_CONTRACT } from "./cli-contract.ts";
import { inertText, newCommandFailure, type CommandResult } from "./new-command-result.ts";
import { jsonValue } from "./schema-check.ts";
import { mapping } from "./model.ts";
import type { CliFailure } from "./run-list-query.ts";

interface Boundary {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
}

interface Request {
  args: string[];
  json: boolean;
  limit: number;
  after?: string;
  home?: string;
  failure?: CliFailure;
}

function failure(cause: string, message: string, details: Record<string, unknown> = {}): CliFailure {
  return { code: "request-invalid", cause, message, retryable: false, details, exit: 2 };
}

function option(args: readonly string[], name: string): { args: string[]; value?: string; count: number; missing: boolean } {
  const found: number[] = [];
  for (let index = 0; index < args.length; index += 1) if (args[index] === name) found.push(index);
  const at = found[0], value = at === undefined ? undefined : args[at + 1];
  const valid = value !== undefined && !value.startsWith("-");
  const consumed = new Set(found.flatMap((index) => valid && index === at ? [index, index + 1] : [index]));
  return { args: args.filter((_word, index) => !consumed.has(index)), ...(valid ? { value } : {}), count: found.length, missing: found.length > 0 && !valid };
}

function integer(raw: string | undefined): number | undefined {
  if (raw === undefined) return ASSEMBLY_READ_CONTRACT.page.default;
  const value = Number(raw);
  return Number.isInteger(value) && value >= ASSEMBLY_READ_CONTRACT.page.minimum && value <= ASSEMBLY_READ_CONTRACT.page.maximum ? value : undefined;
}

function parsePage(args: string[]): { args: string[]; after?: string; limit: number; failure?: CliFailure } {
  const after = option(args, "--after");
  if (after.count > 1) return { args, limit: ASSEMBLY_READ_CONTRACT.page.default, failure: failure("option-repeated", "Assembly check accepts --after once.") };
  if (after.missing) return { args, limit: ASSEMBLY_READ_CONTRACT.page.default, failure: failure("value-missing", "Assembly check requires a value after --after.") };
  const limit = option(after.args, "--limit");
  if (limit.count > 1) return { args, limit: ASSEMBLY_READ_CONTRACT.page.default, failure: failure("option-repeated", "Assembly check accepts --limit once.") };
  if (limit.missing) return { args, limit: ASSEMBLY_READ_CONTRACT.page.default, failure: failure("value-missing", "Assembly check requires a value after --limit.") };
  const page = integer(limit.value);
  if (page === undefined) return { args, limit: ASSEMBLY_READ_CONTRACT.page.default, failure: failure("limit-invalid", "Assembly check limit must be an integer from 1 through 200.") };
  return { args: limit.args, limit: page, ...(after.value === undefined ? {} : { after: after.value }) };
}

function parse(args: string[], boundary: Boundary): Request {
  const modes = args.filter((word) => word === "--json" || word === "-j");
  const json = modes.length > 0;
  if (modes.length > 1) return { args, json, limit: ASSEMBLY_READ_CONTRACT.page.default, failure: failure("option-repeated", "Assembly check accepts one JSON mode flag.") };
  const page = parsePage(args.filter((word) => word !== "--json" && word !== "-j"));
  if (page.failure !== undefined) return { args, json, limit: page.limit, failure: page.failure };
  const held = takeHome(page.args, boundary.cwd, boundary.env);
  if (args.filter((word) => word === "--home").length > 1) return { args, json, limit: page.limit, failure: failure("option-repeated", "Assembly check accepts --home once.") };
  if (held.home === undefined) return { args, json, limit: page.limit, failure: failure("value-missing", "Assembly check requires a value after --home.") };
  if (page.after !== undefined && Buffer.byteLength(page.after) > ASSEMBLY_READ_CONTRACT.cursor.encodedBytes) return { args, json, limit: page.limit, failure: failure("cursor-limit", "Assembly check cursor must not exceed 8,192 bytes.") };
  return { args: held.args, json, limit: page.limit, home: held.home, ...(page.after === undefined ? {} : { after: page.after }) };
}

function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "-";
}

function humanLine(line: string): string {
  const document = parseDocument(line), held: unknown = document.errors.length === 0 ? document.toJS() : undefined;
  if (document.errors.length > 0 || !mapping(held)) return inertText(line, ASSEMBLY_READ_CONTRACT.output.rowBytes).text;
  const input = Array.isArray(held["input"]) ? held["input"].map(scalar).join(",") : "-";
  const options = mapping(held["options"]) ? Object.entries(held["options"]).map(([name, value]) => `${name}=${mapping(value) ? scalar(value["value"]) : "-"}`).join(",") : "-";
  return inertText(`${scalar(held["stage"])}  ${scalar(held["type"])}  input=${input}  output=${scalar(held["output"])}  options=${options}`, ASSEMBLY_READ_CONTRACT.output.rowBytes).text;
}

function decodedCursor(raw: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/u.test(raw)) return undefined;
  const bytes = Buffer.from(raw, "base64url");
  if (bytes.length > ASSEMBLY_READ_CONTRACT.cursor.decodedBytes) return undefined;
  const parsed = jsonValue(bytes);
  return "error" in parsed ? undefined : parsed.value;
}

function decodeCursor(raw: string, target: string, length: number): number | undefined {
  const value = decodedCursor(raw);
  if (!mapping(value)) return undefined;
  if (value["version"] !== 1 || value["target"] !== hashBytes(Buffer.from(target))) return undefined;
  const after = value["after"];
  if (typeof after !== "number" || !Number.isSafeInteger(after) || after < 0 || after >= length) return undefined;
  return after + 1;
}

function cursor(target: string, after: number): string {
  return Buffer.from(jsonObject({ version: 1, target: hashBytes(Buffer.from(target)), after })).toString("base64url");
}

function resultDocument(target: string, rows: readonly Record<string, unknown>[], offset: number, total: number, limit: number): Record<string, unknown> {
  const end = Math.min(offset + limit, total), complete = end >= total;
  const next = complete ? null : cursor(target, end - 1);
  return { schemaVersion: 1, kind: "bot.assembly.check", data: { target, stages: rows.slice(offset, end) },
    page: { limit, next, through: null, complete }, summary: { returned: end - offset, matched: total, warningCount: 0, warningsOmitted: 0 }, warnings: [] };
}

function refused(result: CheckResult, target: string, json: boolean): CommandResult {
  const details = { faults: result.faults ?? [] };
  return newCommandFailure("assembly.check", failure("assembly-invalid", "The assembly is not valid.", details), json);
}

function closedCheckArgs(args: readonly string[]): CliFailure | undefined {
  let positionals = 0;
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index] ?? "";
    if (!word.startsWith("--")) {
      positionals += 1;
      if (positionals > 2) return failure("argument-extra", "Assembly check accepts one target and one request.");
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("-")) return failure("value-missing", `Assembly check requires a value after ${word}.`);
    index += 1;
  }
  return undefined;
}

function successfulCheck(parsed: Request, input: Extract<ReturnType<typeof readInvocationTokens>, { status: "accepted" }>, boundary: Boundary): number {
  const target = parsed.args[0] ?? "";
  const offset = parsed.after === undefined ? 0 : decodeCursor(parsed.after, target, input.result.lines.length);
  if (offset === undefined) {
    const output = newCommandFailure("assembly.check", failure("cursor-invalid", "Assembly check received an invalid cursor."), parsed.json);
    boundary.stderr(output.stderr); return output.exit;
  }
  const stages = input.result.lines.flatMap((line) => {
    const parsedLine = jsonValue(Buffer.from(line));
    return "error" in parsedLine || !mapping(parsedLine.value) ? [] : [parsedLine.value];
  });
  const document = resultDocument(target, stages, offset, input.result.lines.length, parsed.limit);
  const stdout = parsed.json
    ? Buffer.from(`${jsonObject(document)}\n`)
    : Buffer.from(input.result.lines.slice(offset, offset + parsed.limit).map(humanLine).join("\n") + "\n");
  if (stdout.length >= ASSEMBLY_READ_CONTRACT.output.pageBytesExclusive) {
    const output = newCommandFailure("assembly.check", failure("result-oversized", "The assembly check result exceeds its output bound", {}), parsed.json);
    boundary.stderr(output.stderr); return output.exit;
  }
  boundary.stdout(stdout);
  if (parsed.json || !mapping(document["page"])) return 0;
  const next = document["page"]["next"];
  if (typeof next === "string") boundary.stderr(`More assembly stages remain. Continue with --after ${next}.\n`);
  return 0;
}

export function assemblyCheckCommand(args: string[], boundary: Boundary): number {
  const parsed = parse(args, boundary);
  if (parsed.failure !== undefined || parsed.home === undefined) {
    const output = newCommandFailure("assembly.check", parsed.failure ?? failure("value-missing", "Assembly check requires a home."), parsed.json);
    boundary.stderr(output.stderr); return output.exit;
  }
  const closedFailure = closedCheckArgs(parsed.args);
  if (closedFailure !== undefined) {
    const output = newCommandFailure("assembly.check", closedFailure, parsed.json);
    boundary.stderr(output.stderr); return output.exit;
  }
  const input = readInvocationTokens(parsed.args, boundary.cwd, boundary.env, parsed.home);
  if (input.status === "refused") {
    const output = refused(input.result, parsed.args[0] ?? "", parsed.json);
    boundary.stderr(output.stderr); return output.exit;
  }
  return successfulCheck(parsed, input, boundary);
}
