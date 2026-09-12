import { existsSync } from "node:fs";
import { readlink, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ASSEMBLY_LIST_FIELDS, ASSEMBLY_READ_CONTRACT, type AssemblyListField } from "./cli-contract.ts";
import { takeHome } from "./flags.ts";
import { heldAssemblies, type Held } from "./inspection.ts";
import { jsonObject } from "./check.ts";
import { hashBytes } from "./record.ts";
import { boundedText, inertText, newCommandFailure, type CommandResult } from "./new-command-result.ts";
import { assemblyMarker } from "./documents.ts";
import { bytewise, errorCode, mapping } from "./model.ts";
import { jsonValue } from "./schema-check.ts";
import type { CliFailure } from "./run-list-query.ts";
import { provenance } from "./management.ts";

interface Boundary { cwd: string; env: NodeJS.ProcessEnv; stdout(bytes: string | Uint8Array): void; stderr(bytes: string | Uint8Array): void }
interface AssemblyRow { name: string; kind: "installed" | "linked"; source: string | null; updated: string | null; target: string | null; broken: boolean }
interface Request { args: string[]; json: boolean; count: boolean; fields: AssemblyListField[]; limit: number; after?: string; home?: string; failure?: CliFailure }

function failure(cause: string, message: string, details: Record<string, unknown> = {}, exit: CliFailure["exit"] = 2): CliFailure {
  return { code: exit === 1 ? "home-not-found" : exit === 4 ? "dependency-failed" : exit === 5 ? "integrity-failed" : "request-invalid", cause, message, retryable: exit === 4, details, exit };
}

function value(args: readonly string[], name: string): { args: string[]; value?: string; count: number; missing: boolean } {
  const indexes = args.flatMap((word, index) => word === name ? [index] : []);
  const at = indexes[0], raw = at === undefined ? undefined : args[at + 1], valid = raw !== undefined && !raw.startsWith("-");
  const consumed = new Set(indexes.flatMap((index) => index === at && valid ? [index, index + 1] : [index]));
  return { args: args.filter((_word, index) => !consumed.has(index)), ...(valid ? { value: raw } : {}), count: indexes.length, missing: indexes.length > 0 && !valid };
}

function parseFields(raw: string | undefined): AssemblyListField[] | undefined {
  const fields = raw === undefined ? [...ASSEMBLY_LIST_FIELDS] : raw.split(",");
  return fields.length > 0 && fields.every(isField) && new Set(fields).size === fields.length ? fields : undefined;
}

function isField(value: string): value is AssemblyListField { return ASSEMBLY_LIST_FIELDS.some((field) => field === value); }

function baseArgs(args: string[]): { rest: string[]; json: boolean; count: boolean; failure?: CliFailure } {
  const modes = args.filter((word) => word === "--json" || word === "-j"), countWords = args.filter((word) => word === "--count");
  if (modes.length > 1) return { rest: args, json: true, count: false, failure: failure("option-repeated", "Assembly list accepts one JSON mode flag.") };
  if (countWords.length > 1) return { rest: args, json: modes.length > 0, count: false, failure: failure("option-repeated", "Assembly list accepts --count once.") };
  return { rest: args.filter((word) => word !== "--json" && word !== "-j" && word !== "--count"), json: modes.length > 0, count: countWords.length > 0 };
}

function parseAfter(args: string[]): { rest: string[]; value?: string; failure?: CliFailure } {
  const held = value(args, "--after");
  if (held.count > 1 || held.missing) return { rest: args, failure: failure(held.missing ? "value-missing" : "option-repeated", "Assembly list requires one value after --after.") };
  return { rest: held.args, ...(held.value === undefined ? {} : { value: held.value }) };
}

function parseFieldPart(args: string[]): { rest: string[]; fields: AssemblyListField[]; value?: string; failure?: CliFailure } {
  const held = value(args, "--fields");
  if (held.count > 1 || held.missing) return { rest: args, fields: [...ASSEMBLY_LIST_FIELDS], failure: failure(held.missing ? "value-missing" : "option-repeated", "Assembly list requires one value after --fields.") };
  const fields = parseFields(held.value);
  return fields === undefined
    ? { rest: args, fields: [...ASSEMBLY_LIST_FIELDS], failure: failure("field-unknown", "Assembly list fields must be unique known fields.") }
    : { rest: held.args, fields, ...(held.value === undefined ? {} : { value: held.value }) };
}

function parseLimit(args: string[]): { rest: string[]; limit: number; value?: string; failure?: CliFailure } {
  const held = value(args, "--limit");
  if (held.count > 1 || held.missing) return { rest: args, limit: 20, failure: failure(held.missing ? "value-missing" : "option-repeated", "Assembly list requires one value after --limit.") };
  const limit = held.value === undefined ? 20 : Number(held.value);
  return !Number.isInteger(limit) || limit < ASSEMBLY_READ_CONTRACT.page.minimum || limit > ASSEMBLY_READ_CONTRACT.page.maximum
    ? { rest: args, limit: 20, failure: failure("limit-invalid", "Assembly list limit must be an integer from 1 through 200.") }
    : { rest: held.args, limit, ...(held.value === undefined ? {} : { value: held.value }) };
}

function parse(args: string[], boundary: Boundary): Request {
  const base = baseArgs(args);
  if (base.failure !== undefined) return { args, json: base.json, count: base.count, fields: [...ASSEMBLY_LIST_FIELDS], limit: 20, failure: base.failure };
  const after = parseAfter(base.rest);
  if (after.failure !== undefined) return { args, json: base.json, count: base.count, fields: [...ASSEMBLY_LIST_FIELDS], limit: 20, failure: after.failure };
  const fields = parseFieldPart(after.rest);
  if (fields.failure !== undefined) return { args, json: base.json, count: base.count, fields: fields.fields, limit: 20, failure: fields.failure };
  const limit = parseLimit(fields.rest);
  if (limit.failure !== undefined) return { args, json: base.json, count: base.count, fields: fields.fields, limit: limit.limit, failure: limit.failure };
  const held = takeHome(limit.rest, boundary.cwd, boundary.env);
  const final = parseHome(held, args, base, fields, limit, after);
  return final;
}

type ParsedHome = Omit<Request, "home" | "failure"> & ({ home: string } | { failure: CliFailure });

function homeFailure(held: { home: string | undefined }, original: readonly string[], base: { count: boolean }, fields: { value?: string }, limit: { value?: string }, after: { value?: string }): CliFailure | undefined {
  if (original.filter((word) => word === "--home").length > 1) return failure("option-repeated", "Assembly list accepts --home once.");
  if (held.home === undefined) return failure("value-missing", "Assembly list requires a value after --home.");
  if (after.value !== undefined && Buffer.byteLength(after.value) > ASSEMBLY_READ_CONTRACT.cursor.encodedBytes) return failure("cursor-limit", "Assembly list cursor must not exceed 8,192 bytes.");
  return base.count && (limit.value !== undefined || after.value !== undefined || fields.value !== undefined)
    ? failure("option-conflict", "Assembly list --count cannot be combined with --limit, --after, or --fields.") : undefined;
}

function leftoverFailure(args: readonly string[]): CliFailure | undefined {
  const first = args[0];
  return first === undefined ? undefined : failure("argument-unknown", `Assembly list does not accept ${first}.`);
}

function parseHome(held: { args: string[]; home: string | undefined }, original: readonly string[], base: { json: boolean; count: boolean }, fields: { fields: AssemblyListField[]; value?: string }, limit: { limit: number; value?: string }, after: { value?: string }): ParsedHome {
  const common = { args: [...original], json: base.json, count: base.count, fields: fields.fields, limit: limit.limit };
  const fault = homeFailure(held, original, base, fields, limit, after);
  if (fault !== undefined) return { ...common, failure: fault };
  const home = held.home ?? "", leftover = leftoverFailure(held.args);
  if (leftover !== undefined) return { ...common, failure: leftover };
  return { ...common, args: held.args, home, ...(after.value === undefined ? {} : { after: after.value }) };
}

async function row(one: Held): Promise<AssemblyRow> {
  if (one.linked) {
    const target = await readlink(one.path);
    const broken = !existsSync(resolve(dirname(one.path), target)) || !assemblyMarker(resolve(dirname(one.path), target));
    return { name: one.name, kind: "linked", source: null, updated: null, target, broken };
  }
  const from = await provenance(one.path);
  return { name: one.name, kind: "installed", source: from?.source ?? null, updated: from?.updated ?? null, target: null, broken: false };
}

function cursor(home: string, after: string): string {
  return Buffer.from(jsonObject({ version: 1, homeHash: hashBytes(Buffer.from(home)), after })).toString("base64url");
}

function cursorAfter(raw: string, home: string, names: readonly string[]): number | undefined {
  if (!/^[A-Za-z0-9_-]+$/u.test(raw)) return undefined;
  const bytes = Buffer.from(raw, "base64url");
  if (bytes.length > ASSEMBLY_READ_CONTRACT.cursor.decodedBytes) return undefined;
  const parsed = jsonValue(bytes);
  if ("error" in parsed || !mapping(parsed.value)) return undefined;
  const value = parsed.value;
  if (value["version"] !== 1 || value["homeHash"] !== hashBytes(Buffer.from(home))) return undefined;
  const after = value["after"];
  if (typeof after !== "string") return undefined;
  const index = names.indexOf(after);
  return index < 0 ? undefined : index + 1;
}

function projected(rowValue: AssemblyRow, fields: readonly AssemblyListField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, rowValue[field]]));
}

function markdown(rows: readonly AssemblyRow[], fields: readonly AssemblyListField[]): Buffer {
  if (rows.length === 0) return Buffer.from("No assemblies match.\n");
  return Buffer.from(rows.map((rowValue) => {
    if (fields.length === ASSEMBLY_LIST_FIELDS.length && fields.every((field, index) => field === ASSEMBLY_LIST_FIELDS[index])) {
      if (rowValue.kind === "linked") return boundedText(`${rowValue.name}  linked  -> ${rowValue.target ?? "-"}${rowValue.broken ? "  BROKEN" : ""}`, ASSEMBLY_READ_CONTRACT.output.rowBytes);
      return boundedText(rowValue.source === null ? `${rowValue.name}  installed  local copy` : `${rowValue.name}  installed  from ${rowValue.source}  updated ${rowValue.updated ?? "-"}`, ASSEMBLY_READ_CONTRACT.output.rowBytes);
    }
    return `| ${fields.map((field) => inertText(rowValue[field] === null ? "-" : String(rowValue[field]), ASSEMBLY_READ_CONTRACT.output.cellBytes).text).join(" | ")} |`;
  }).join("\n") + "\n");
}

function resultError(held: CliFailure, json: boolean): CommandResult { return newCommandFailure("assembly.list", held, json); }

function emitFailure(boundary: Boundary, held: CliFailure, json: boolean): number {
  const output = resultError(held, json);
  boundary.stderr(output.stderr); return output.exit;
}

function countOutput(boundary: Boundary, json: boolean, count: number): number {
  if (!json) boundary.stdout(`${String(count)} assemblies match.\n`);
  else boundary.stdout(`${jsonObject({ schemaVersion: 1, kind: "bot.assembly.list", data: [], page: { limit: 0, next: null, through: null, complete: true }, summary: { returned: 0, matched: count, warningCount: 0, warningsOmitted: 0 }, warnings: [] })}\n`);
  return 0;
}

async function readRows(path: string, parsed: Request, boundary: Boundary): Promise<number> {
  const held = heldAssemblies(path).sort((first, second) => bytewise(first.name, second.name));
  const names = held.map((one) => one.name);
  const offset = parsed.after === undefined ? 0 : cursorAfter(parsed.after, path, names);
  if (offset === undefined) return emitFailure(boundary, failure("cursor-invalid", "Assembly list received an invalid cursor."), parsed.json);
  if (parsed.count) return countOutput(boundary, parsed.json, names.length);
  const rows = await Promise.all(held.map(row));
  return emitRows(path, parsed, boundary, rows, names, offset);
}

function emitRows(path: string, parsed: Request, boundary: Boundary, rows: readonly AssemblyRow[], names: readonly string[], offset: number): number {
  const selected = rows.slice(offset, offset + parsed.limit), complete = offset + selected.length >= rows.length;
  const next = complete || selected.length === 0 ? null : cursor(path, selected.at(-1)?.name ?? "");
  const document = { schemaVersion: 1, kind: "bot.assembly.list", data: selected.map((one) => projected(one, parsed.fields)),
    page: { limit: parsed.limit, next, through: names.at(-1) ?? null, complete }, summary: { returned: selected.length, matched: rows.length, warningCount: 0, warningsOmitted: 0 }, warnings: [] };
  const output = parsed.json ? Buffer.from(`${jsonObject(document)}\n`) : markdown(selected, parsed.fields);
  if (output.length >= ASSEMBLY_READ_CONTRACT.output.pageBytesExclusive) return emitFailure(boundary, failure("result-oversized", "The assembly list result exceeds its output bound.", {}, 5), parsed.json);
  boundary.stdout(output);
  if (!parsed.json && next !== null) boundary.stderr(`More assemblies remain. Continue with --after ${next}.\n`);
  return 0;
}

function inspect(path: string, parsed: Request, boundary: Boundary): Promise<number> {
  return stat(path).then(
    (held) => held.isDirectory() ? readRows(path, parsed, boundary) : Promise.resolve(emitFailure(boundary, failure("path-not-directory", `The bot home at ${path} is not a directory.`, { home: path }, 1), parsed.json)),
    (reason: unknown) => emitFailure(boundary, failure(errorCode(reason) ?? "filesystem-error", errorCode(reason) === "ENOENT" ? `There is no bot home at ${path}.` : "Assembly list could not read the Bot home.", { home: path }, errorCode(reason) === "ENOENT" ? 1 : 4), parsed.json),
  );
}

export function assemblyListCommand(args: string[], boundary: Boundary): number | Promise<number> {
  const parsed = parse(args, boundary);
  if (parsed.failure !== undefined || parsed.home === undefined) return emitFailure(boundary, parsed.failure ?? failure("value-missing", "Assembly list requires a home."), parsed.json);
  return inspect(parsed.home, parsed, boundary);
}
