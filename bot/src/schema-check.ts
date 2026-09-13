import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parseDocument } from "yaml";
import { mapping } from "./model.ts";

export type StageSchema =
  | { kind: "json"; path: string }
  | { kind: "markdown"; path: string };

export interface SchemaCheckResult {
  passed: boolean;
  message: Buffer;
}

function failure(message: string): SchemaCheckResult {
  return { passed: false, message: Buffer.from(`${message}\n`) };
}

/** The runtime's one JSON parse: bytes in, an outcome out, never a throw for a
 *  caller to translate. Its third caller is credentials.ts, which turns the
 *  error into the store's own sentence rather than repeating Node's (ticket
 *  0144's audit) — a parse failure is a fact about a file, and what to SAY
 *  about it belongs to whoever named the file. */
export function jsonValue(bytes: Buffer): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkJson(schema: StageSchema & { kind: "json" }, output: Buffer): Promise<SchemaCheckResult> {
  const parsed = jsonValue(output);
  if ("error" in parsed) return failure(`Invalid JSON: ${parsed.error}`);
  const schemaBytes = await readFile(schema.path);
  const held = jsonValue(schemaBytes);
  if ("error" in held) throw new TypeError(`Validated JSON schema no longer parses: ${schema.path}`);
  if (typeof held.value !== "boolean" && !mapping(held.value)) {
    throw new TypeError(`Validated JSON schema is not a schema: ${schema.path}`);
  }
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validate = ajv.compile(held.value);
  if (validate(parsed.value)) return { passed: true, message: Buffer.alloc(0) };
  return failure(ajv.errorsText(validate.errors, { separator: "\n" }));
}

function frontmatter(source: string): { value: Record<string, unknown> } | { error: string } {
  const lines = source.split(/\r?\n/);
  if (lines[0] !== "---") return { error: "Markdown output has no frontmatter." };
  const end = lines.indexOf("---", 1);
  if (end < 0) return { error: "Markdown output has unclosed frontmatter." };
  const document = parseDocument(lines.slice(1, end).join("\n"), { uniqueKeys: true });
  if (document.errors.length > 0) return { error: document.errors.map((item) => item.message).join("\n") };
  const value: unknown = document.toJS();
  if (value === null) return { value: {} };
  return mapping(value) ? { value } : { error: "Markdown frontmatter must be a mapping." };
}

/** Whether the bytes of a document's frontmatter — the fences and everything between
 *  them, the body excluded — are valid UTF-8. Frontmatter's bytes are validated and a
 *  body's are not, for an agent's output (schema.md) and for an authored document
 *  alike (Ian, 2026-08-05: strict config, tolerant prose), so the split is on BYTES: a lossy decode
 *  substitutes U+FFFD and destroys the evidence first. `latin1` is byte-for-byte, and
 *  the fence and its newline are ASCII, which no UTF-8 sequence can contain — so this
 *  finds the closing fence where `frontmatter` finds it. No fence means no bytes to
 *  judge, so this is vacuously true and the shape failure is left to `frontmatter` to
 *  report. The round-trip is the test, not a catch: a replacing decode is unstable
 *  exactly on invalid input (ticket 0092). */
export function frontmatterIsUtf8(output: Buffer): boolean {
  const [fence = ""] = /^---\r?\n(?:[\s\S]*?\n)?---(?:\r?\n|$)/u.exec(output.toString("latin1")) ?? [];
  const bytes = output.subarray(0, fence.length);
  return Buffer.compare(Buffer.from(bytes.toString("utf8"), "utf8"), bytes) === 0;
}

function date(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const held = new Date(Date.UTC(year, month - 1, day));
  return held.getUTCFullYear() === year && held.getUTCMonth() === month - 1 && held.getUTCDate() === day;
}

/** Every slim schema type and what it accepts, in one place: `validateSlimSchema` asks
 *  this map at validation, so an unknown type refuses before the run rather than below. */
export const SLIM_TYPES = new Map<unknown, (value: unknown) => boolean>([
  [null, () => true],
  ["str", (value) => typeof value === "string"],
  ["int", (value) => typeof value === "number" && Number.isInteger(value)],
  ["float", (value) => typeof value === "number"],
  ["bool", (value) => typeof value === "boolean"],
  ["list", (value) => Array.isArray(value)],
  ["date", (value) => typeof value === "string" && date(value)],
]);

function matchesSlimType(value: unknown, type: unknown): boolean {
  const accepts = SLIM_TYPES.get(type);
  if (accepts === undefined) throw new TypeError(`Unknown slim schema type: ${String(type)}`);
  return accepts(value);
}

async function checkMarkdown(schema: StageSchema & { kind: "markdown" }, output: Buffer): Promise<SchemaCheckResult> {
  const template = frontmatter(await readFile(schema.path, "utf8"));
  if ("error" in template) throw new TypeError(`Validated Markdown schema is invalid: ${template.error}`);
  if (!frontmatterIsUtf8(output)) return failure("Markdown frontmatter is not valid UTF-8.");
  const actual = frontmatter(output.toString("utf8"));
  if ("error" in actual) return failure(actual.error);
  const errors: string[] = [];
  for (const [key, type] of Object.entries(template.value)) {
    if (!(key in actual.value)) errors.push(`Markdown frontmatter is missing ${key}.`);
    else if (!matchesSlimType(actual.value[key], type)) errors.push(`Markdown frontmatter ${key} is not ${String(type)}.`);
  }
  return errors.length === 0 ? { passed: true, message: Buffer.alloc(0) } : failure(errors.join("\n"));
}

export function checkSchema(schema: StageSchema, output: Buffer): Promise<SchemaCheckResult> {
  return schema.kind === "json" ? checkJson(schema, output) : checkMarkdown(schema, output);
}
