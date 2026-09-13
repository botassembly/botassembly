import {
  lstatSync,
  readFileSync,
  readdirSync,
  type Dirent,
} from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parseDocument } from "yaml";
import {
  LOCAL_CONTEXTS,
  OPTION_NAMES,
  REASONING_LEVELS,
  bytewise,
  fault,
  mapping,
  stem,
  visible,
  type AuthoredOptions,
  type MarkdownDocument,
  type OptionName,
} from "./model.ts";
import { SLIM_TYPES, frontmatterIsUtf8 } from "./schema-check.ts";
import type { Refusal } from "./spine.ts";

/** A mapping, or where the parse went wrong: `where` is the yaml library's own
 *  line and column moved into the file's lines by `offset` (the fence the caller
 *  sliced off), and empty where the library gives none — never invented (0128). */
export function yamlMapping(source: string, offset: number): { data?: Record<string, unknown>; where: string } {
  const document = parseDocument(source, { uniqueKeys: true });
  const at = document.errors[0]?.linePos?.[0];
  const where = at === undefined ? "" : ` at line ${String(at.line + offset)}, column ${String(at.col)}`;
  if (document.errors.length > 0) return { where };
  let value: unknown;
  try {
    value = document.toJS();
  } catch {
    return { where };
  }
  if (value === null) return { data: {}, where };
  return mapping(value) ? { data: value, where } : { where };
}

// HTML comments are author-to-human (assembly.md): stripped from every body
// here at the read seam, so every consumer — prompt, body-present check,
// checklist extraction, loop question — sees the stripped body. Files on disk
// are never rewritten. An opener unclosed at EOF comments out the rest of the
// body: the HTML reading, and the honest one — nothing after `<!--` was
// addressed to the agent.
function stripComments(body: string): string {
  return body.replace(/<!--[\s\S]*?(?:-->|$)/gu, "");
}

/** Read an authored document's bytes; a directory, fifo, or unreadable file is
 *  none. Bytes and not text: the decode is the caller's, because where it is
 *  allowed to replace a bad byte is not the same everywhere in a document. */
export function readBytes(filename: string): Buffer | undefined {
  try {
    return lstatSync(filename).isFile() ? readFileSync(filename) : undefined;
  } catch {
    return undefined;
  }
}

/** A directory's entries in bytewise order, invisible names included;
 *  unreadable lists as empty. Only `bot status`'s walk of the copies an
 *  interrupted update stranded reads this rather than `entries` (ticket 0124). */
export function allEntries(dir: string): Dirent[] {
  let held: Dirent[] = [];
  try {
    held = readdirSync(dir, { withFileTypes: true });
  } catch {
    return held;
  }
  return held.sort((a, b) => bytewise(a.name, b.name));
}

/** A directory's visible entries in bytewise order; unreadable lists as empty. */
export function entries(dir: string): Dirent[] {
  return allEntries(dir).filter((entry) => visible(entry.name));
}

export function readMarkdown(
  filename: string,
  path: string,
  faults: Refusal[],
  optionalFrontmatter = false,
): MarkdownDocument {
  const bytes = readBytes(filename);
  if (bytes === undefined) {
    fault(faults, "frontmatter-invalid", path, "Make the document a readable file.");
    return { data: {}, body: "", sound: false };
  }
  // Strict config, tolerant prose (Ian, 2026-08-05). The decode below replaces a
  // bad byte with U+FFFD and says nothing, which is right for a body an agent
  // reads and wrong for frontmatter bot ACTS on: `model: gpt<FF>4` reached the
  // provider as a name nothing serves, and a schema template's torn key demanded
  // a field no agent could spell. This is the same round trip schema-check.ts
  // applies to an agent's output, on the same byte-level split, so authored and
  // produced frontmatter are judged by one rule. It refuses BYTES, never the
  // character: a U+FFFD an author really typed is valid UTF-8 and round-trips.
  if (!frontmatterIsUtf8(bytes)) {
    fault(faults, "frontmatter-invalid", path, "Make the frontmatter valid UTF-8.");
    return { data: {}, body: "", sound: false };
  }
  const source = bytes.toString("utf8");
  // Documents are UTF-8 without a byte-order mark (refusals.md): a BOM is
  // refused by name, never silently stripped — fenced or fence-less alike.
  if (source.startsWith("\uFEFF")) {
    fault(faults, "frontmatter-invalid", path, "Remove the byte-order mark.");
    return { data: {}, body: "", sound: false };
  }
  const lines = source.split(/\r?\n/);
  if (lines[0] !== "---") {
    if (optionalFrontmatter) return { data: {}, body: stripComments(source), sound: true };
    fault(faults, "frontmatter-invalid", path, "Add fenced YAML frontmatter.");
    return { data: {}, body: "", sound: false };
  }
  const end = lines.indexOf("---", 1);
  if (end < 0) {
    fault(faults, "frontmatter-invalid", path, "Close the YAML frontmatter fence.");
    return { data: {}, body: "", sound: false };
  }
  const body = stripComments(lines.slice(end + 1).join("\n"));
  // One line below the opening fence, so the position is the file's own.
  const yaml = yamlMapping(lines.slice(1, end).join("\n"), 1);
  if (yaml.data === undefined) {
    fault(faults, "frontmatter-invalid", path, `Fix the YAML frontmatter${yaml.where}.`);
    return { data: {}, body, sound: false };
  }
  return { data: yaml.data, body, sound: true };
}

function nonemptyString(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

// `timeout` is seconds and reaches setTimeout as milliseconds, where node's
// timer is 32-bit. Measured on node v22.22.3: 2_147_483_647 ms is honoured;
// 2_147_483_648 ms warns TimeoutOverflowWarning, is "set to 1", and fires 8 ms
// later — the largest timeouts behaving as the smallest. 2_147_483 s is the
// last whole second that fits. invocation.md requires the refusal and leaves
// the value to the runtime, which is this number (Revision 6).
export const TIMEOUT_MAX = 2_147_483;

function boundedInteger(value: unknown, minimum: number, maximum = Number.POSITIVE_INFINITY): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function oneOf(words: readonly string[], value: unknown): boolean {
  return typeof value === "string" && words.includes(value);
}

export function validOption(name: OptionName | "provider" | "model" | "reasoning", value: unknown): value is string | number {
  switch (name) {
    case "provider":
    case "model":
    case "intelligence":
      return nonemptyString(value);
    case "reasoning":
      return oneOf(REASONING_LEVELS, value);
    case "local-context":
      return oneOf(LOCAL_CONTEXTS, value);
    case "timeout":
      return boundedInteger(value, 1, TIMEOUT_MAX);
    case "retries":
      return boundedInteger(value, 0);
  }
}

function validStageWorkdir(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || isAbsolute(value)) return false;
  return normalize(value) !== "." && !value.split(/[\\/]/u).includes("..");
}

export function validTmpMaxBytes(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validExtra(name: string, value: unknown): boolean {
  switch (name) {
    case "description":
      return nonemptyString(value);
    case "repeat":
    case "width":
    case "max-depth":
      return boundedInteger(value, 1);
    case "tmp":
      return value === "flow" || value === "stage";
    case "workdir":
      return validStageWorkdir(value);
    case "slots":
      return mapping(value) ? Object.values(value).every((item) => typeof item === "string") : false;
    default:
      return true;
  }
}

function validateKeys(
  data: Record<string, unknown>, path: string, faults: Refusal[], extras: readonly string[], required: readonly string[], optionNames: readonly OptionName[],
): void {
  const allowed = new Set([...optionNames, ...extras]);
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) {
      const retired = new Set(["model", "provider", "reasoning", "profile", "tier", "profiles"]);
      const sentence = retired.has(key)
        ? `Remove the retired key ${key}; define the choice in the home intelligences table and name it with --intelligence.`
        : `Remove the unknown key ${key}.`;
      fault(faults, "key-unknown", path, sentence);
    }
  }
  for (const key of required) {
    if (!(key in data)) fault(faults, "key-missing", path, `Add the required key ${key}.`);
  }
}

function collectOptions(data: Record<string, unknown>, path: string, faults: Refusal[], optionNames: readonly OptionName[]): AuthoredOptions {
  const options: AuthoredOptions = {};
  for (const name of optionNames) {
    const value = data[name];
    if (value === undefined) continue;
    if (validOption(name, value)) options[name] = value;
    else fault(faults, "value-invalid", path, `Give ${name} a valid value.`);
  }
  return options;
}

function validateExtra(name: string, value: unknown): boolean {
  return name === "tmp-max-bytes" ? validTmpMaxBytes(value) : validExtra(name, value);
}

function validateExtras(
  data: Record<string, unknown>, path: string, faults: Refusal[], extras: readonly string[],
): void {
  for (const name of extras) {
    const value = data[name];
    if (value !== undefined && !validateExtra(name, value)) {
      fault(faults, "value-invalid", path, `Give ${name} a valid value.`);
    }
  }
}

export function validateData(
  data: Record<string, unknown>,
  path: string,
  faults: Refusal[],
  extras: readonly string[] = [],
  required: readonly string[] = [],
  optionNames: readonly OptionName[] = OPTION_NAMES,
): AuthoredOptions {
  validateKeys(data, path, faults, extras, required, optionNames);
  const options = collectOptions(data, path, faults, optionNames);
  validateExtras(data, path, faults, extras);
  return options;
}

// An assembly holds no other (assembly.md): a skill tree may hold anything
// except a nested ASSEMBLY.md, which no probe below this one would see.
function refuseNestedAssemblies(dir: string, path: string, faults: Refusal[]): void {
  for (const entry of entries(dir)) {
    const relative = `${path}/${entry.name}`;
    if (entry.name === "ASSEMBLY.md") fault(faults, "entry-unknown", relative, "Remove the nested assembly manifest.");
    else if (entry.isDirectory()) refuseNestedAssemblies(join(dir, entry.name), relative, faults);
  }
}

export function readSkills(dir: string, path: string, faults: Refusal[]): string[] {
  const held = entries(dir);
  if (held.length === 0) fault(faults, "folder-empty", path, "Add a skill or remove the folder.");
  const names: string[] = [];
  for (const entry of held) {
    const skillPath = join(dir, entry.name);
    const relative = `${path}/${entry.name}`;
    if (!entry.isDirectory()) {
      fault(faults, "entry-unknown", relative, "Put each skill in its own folder.");
      continue;
    }
    names.push(entry.name);
    refuseNestedAssemblies(skillPath, relative, faults);
    const manifest = join(skillPath, "SKILL.md");
    if (!lstatExists(manifest)) {
      fault(faults, "skill-invalid", relative, "Add SKILL.md to the skill folder.");
      continue;
    }
    const document = readMarkdown(manifest, `${relative}/SKILL.md`, faults);
    if (document.sound) {
      if (!("description" in document.data)) {
        fault(faults, "key-missing", `${relative}/SKILL.md`, "Add the skill description.");
      } else if (!validExtra("description", document.data["description"])) {
        fault(faults, "value-invalid", `${relative}/SKILL.md`, "Give description a nonempty string.");
      }
    }
  }
  return names;
}

export function validateRunnable(filename: string, path: string, faults: Refusal[]): void {
  let runnable = false;
  try {
    const bytes = readFileSync(filename);
    runnable = (lstatSync(filename).mode & 0o111) !== 0
      && (bytes.subarray(0, 2).toString() === "#!" || bytes.includes(0));
  } catch {
    // An unreadable file cannot be run.
  }
  if (!runnable) {
    fault(faults, "not-runnable", path, "Make the file executable with a shebang or binary format.");
  }
}

export function validateJsonSchema(filename: string, path: string, faults: Refusal[]): void {
  let schema: unknown;
  try {
    // Fatal, not the replacing `readFileSync(filename, "utf8")`: JSON is UTF-8
    // (RFC 8259) so a mis-encoded schema is not a schema. Replacing it would
    // accept here what schema-check.ts then throws on mid-run (ticket 0092).
    schema = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(filename))) as unknown;
  } catch {
    fault(faults, "schema-invalid", path, "Fix the schema JSON.");
    return;
  }
  if (mapping(schema) && "$schema" in schema) {
    const dialect = schema["$schema"];
    if (dialect !== "https://json-schema.org/draft/2020-12/schema" && dialect !== "https://json-schema.org/draft/2020-12/schema#") {
      fault(faults, "schema-invalid", path, "Use JSON Schema draft 2020-12.");
      return;
    }
  }
  if (typeof schema !== "boolean" && !mapping(schema)) {
    fault(faults, "schema-invalid", path, "Fix the invalid JSON Schema.");
    return;
  }
  // Compiled, not merely meta-validated: `{"$ref": "#/definitions/nope"}` is a
  // valid 2020-12 document that fails only when ajv resolves the reference, and
  // schema-check.ts first resolved it against a finished, already-paid output.
  try {
    new Ajv2020({ strict: false, allErrors: true }).compile(schema);
  } catch {
    fault(faults, "schema-invalid", path, "Fix the invalid JSON Schema.");
  }
}

/** A Markdown schema is a template of slim types (schema.md); an unknown one used to surface only at output-check time. */
export function validateSlimSchema(filename: string, path: string, faults: Refusal[]): void {
  for (const type of Object.values(readMarkdown(filename, path, faults).data)) {
    if (!SLIM_TYPES.has(type)) fault(faults, "schema-invalid", path, `Give the key a known slim type, not ${String(type)}.`);
  }
}

export function lstatExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    // Unreachable counts as absent: the reader refuses on absence, not crash.
    return false;
  }
}

/** A directory is an assembly when it holds `ASSEMBLY.md` — one question, asked
 *  by the walk, the resolver and `link` alike, and asked again at every read. */
export const assemblyMarker = (path: string): boolean => lstatExists(join(path, "ASSEMBLY.md"));

export const HOOK_KINDS = ["before", "failure", "success"] as const;

export function hookKind(name: string): (typeof HOOK_KINDS)[number] | undefined {
  return HOOK_KINDS.find((kind) => kind === stem(name));
}
