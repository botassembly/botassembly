import { createHash } from "node:crypto";
import { isUtf8 } from "node:buffer";
import { SECRET_CREDENTIAL_ENVIRONMENT_NAMES } from "./credential-environment.ts";

type SecretRuleId = "anthropic-key" | "aws-access-key" | "environment-assignment" | "github-classic" | "github-fine-grained" | "google-api-key" | "groq-key" | "openai-project" | "openai-service" | "private-key" | "xai-key";
export interface SecretMatch { ruleId: SecretRuleId; line: number; byteOffset: number; sha256: string }
export type SecretDetectionResult = { kind: "binary" } | { kind: "candidate-too-large" } | { kind: "matches"; matches: SecretMatch[] } | { kind: "too-many-matches" };

interface PrefixRule { ruleId: SecretRuleId; prefix: string; minimum: number; maximum: number; alphabet: "alphanumeric" | "fine" | "generic" | "upper" }
interface PhysicalLine { text: string; start: number; contentEnd: number; next: number }
interface Span { start: number; end: number }

const MAX_CANDIDATE_BYTES = 2_097_152;
const MAX_MATCHES = 100;
const PREFIX_RULES: readonly PrefixRule[] = [
  { ruleId: "openai-project", prefix: "sk-proj-", minimum: 40, maximum: 256, alphabet: "generic" },
  { ruleId: "openai-service", prefix: "sk-svcacct-", minimum: 40, maximum: 256, alphabet: "generic" },
  { ruleId: "anthropic-key", prefix: "sk-ant-", minimum: 40, maximum: 256, alphabet: "generic" },
  { ruleId: "google-api-key", prefix: "AIza", minimum: 39, maximum: 39, alphabet: "generic" },
  { ruleId: "github-fine-grained", prefix: "github_pat_", minimum: 30, maximum: 255, alphabet: "fine" },
  ...["ghp_", "gho_", "ghu_", "ghs_", "ghr_"].map((prefix) => ({ ruleId: "github-classic" as const, prefix, minimum: 40, maximum: 40, alphabet: "alphanumeric" as const })),
  ...["AKIA", "ASIA"].map((prefix) => ({ ruleId: "aws-access-key" as const, prefix, minimum: 20, maximum: 20, alphabet: "upper" as const })),
  { ruleId: "groq-key", prefix: "gsk_", minimum: 40, maximum: 128, alphabet: "generic" },
  { ruleId: "xai-key", prefix: "xai-", minimum: 40, maximum: 256, alphabet: "generic" },
];
const PREFIX_BYTES = PREFIX_RULES.map((rule) => ({ rule, bytes: Buffer.from(rule.prefix) }));
const PEM_LABELS = new Set(["PRIVATE KEY", "ENCRYPTED PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY", "DSA PRIVATE KEY", "OPENSSH PRIVATE KEY"]);
const ASSIGNMENT_NAMES = [...SECRET_CREDENTIAL_ENVIRONMENT_NAMES].sort((left, right) => right.length - left.length).join("|");
const SHELL_ASSIGNMENT = new RegExp(`^[ \\t]*(?:export[ \\t]+)?(${ASSIGNMENT_NAMES})[ \\t]*=[ \\t]*(?:\"([^\"\\\\]*)\"|'([^'\\\\]*)'|([^ \\t\"'\`][^ \\t]*))[ \\t]*(?:#.*)?$`, "u");
const YAML_ASSIGNMENT = new RegExp(`^[ \\t]*(${ASSIGNMENT_NAMES})[ \\t]*:[ \\t]*(?:\"([^\"\\\\]*)\"|'([^'\\\\]*)'|([^ \\t\"'\`][^ \\t]*))[ \\t]*(?:#.*)?$`, "u");
const OBJECT_ASSIGNMENT = new RegExp(`^[ \\t]*(?:\"(${ASSIGNMENT_NAMES})\"|'(${ASSIGNMENT_NAMES})'|(${ASSIGNMENT_NAMES}))[ \\t]*:[ \\t]*(?:\"([^\"\\\\]*)\"|'([^'\\\\]*)')[ \\t]*(?:[,}]?[ \\t]*(?://.*)?)?$`, "u");
const PEM_BEGIN = /^-----BEGIN (.+)-----$/u;
const PEM_END = /^-----END (.+)-----$/u;

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function physicalLines(bytes: Buffer): PhysicalLine[] {
  const lines: PhysicalLine[] = [];
  let start = 0;
  for (let at = 0; at <= bytes.length; at += 1) {
    if (at !== bytes.length && bytes[at] !== 0x0a) continue;
    const contentEnd = at > start && bytes[at - 1] === 0x0d ? at - 1 : at;
    lines.push({ text: bytes.subarray(start, contentEnd).toString("utf8"), start, contentEnd, next: at < bytes.length ? at + 1 : at });
    start = at + 1;
  }
  return lines;
}

function printableNonSpaceAscii(value: string): boolean {
  if (value.length < 20 || value.length > 4_096) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x21 || code > 0x7e) return false;
  }
  return true;
}

function excludedValue(value: string): boolean {
  const lower = value.toLowerCase();
  return lower === "redacted" || lower === "example" || lower === "placeholder" || lower === "not-a-secret" || /^[x*.]+$/iu.test(value) || /^<[^<>]*>$/u.test(value);
}

function firstCapture(match: RegExpExecArray, start: number): string {
  return match.slice(start).join("");
}

function assignmentValue(line: string): { value: string; delimiter: "colon" | "equals" } | undefined {
  const candidates = [
    { match: OBJECT_ASSIGNMENT.exec(line), capture: 4, delimiter: "colon" as const },
    { match: SHELL_ASSIGNMENT.exec(line), capture: 2, delimiter: "equals" as const },
    { match: YAML_ASSIGNMENT.exec(line), capture: 2, delimiter: "colon" as const },
  ];
  for (const candidate of candidates) {
    if (candidate.match !== null) return { value: firstCapture(candidate.match, candidate.capture), delimiter: candidate.delimiter };
  }
  return undefined;
}

function assignmentStart(line: string, delimiter: "colon" | "equals"): number {
  let at = line.indexOf(delimiter === "colon" ? ":" : "=") + 1;
  while (line[at] === " " || line[at] === "\t") at += 1;
  if (line[at] === "\"" || line[at] === "'") at += 1;
  return at;
}

function assignmentMatches(bytes: Buffer, lines: readonly PhysicalLine[]): { matches: SecretMatch[]; spans: Span[] } {
  const matches: SecretMatch[] = [];
  const spans: Span[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    const held = assignmentValue(line.text);
    if (held === undefined || !printableNonSpaceAscii(held.value) || excludedValue(held.value)) continue;
    const withinLine = assignmentStart(line.text, held.delimiter);
    const start = line.start + Buffer.byteLength(line.text.slice(0, withinLine));
    const end = start + Buffer.byteLength(held.value);
    matches.push({ ruleId: "environment-assignment", line: index + 1, byteOffset: start, sha256: digest(bytes.subarray(start, end)) });
    spans.push({ start, end });
    if (matches.length > MAX_MATCHES) break;
  }
  return { matches, spans };
}

function generic(byte: number | undefined): boolean {
  return byte !== undefined && ((byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a) || (byte >= 0x30 && byte <= 0x39) || byte === 0x5f || byte === 0x2d);
}

function alphanumeric(byte: number): boolean {
  return (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a) || (byte >= 0x30 && byte <= 0x39);
}

function upperNumeric(byte: number): boolean {
  return (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x30 && byte <= 0x39);
}

function inAlphabet(byte: number | undefined, alphabet: PrefixRule["alphabet"]): boolean {
  if (byte === undefined) return false;
  if (alphabet === "upper") return upperNumeric(byte);
  if (alphabet === "alphanumeric") return alphanumeric(byte);
  if (alphabet === "fine") return alphanumeric(byte) || byte === 0x5f;
  return generic(byte);
}

function base64Byte(byte: number): boolean {
  return alphanumeric(byte) || byte === 0x2b || byte === 0x2f || byte === 0x3d;
}

function pemBodyLength(body: Buffer): number | undefined {
  let size = 0;
  for (let index = 0; index < body.length; index += 1) {
    const byte = body[index];
    if (byte === undefined) continue;
    if (byte === 0x0d && body[index + 1] !== 0x0a) return undefined;
    if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
    if (!base64Byte(byte)) return undefined;
    size += 1;
  }
  return size;
}

function boundedPem(bodyLength: number | undefined, completeLength: number): boolean {
  return bodyLength !== undefined && bodyLength >= 64 && bodyLength <= 15_000 && completeLength <= 16_384;
}

function pemBetween(bytes: Buffer, lines: readonly PhysicalLine[], beginIndex: number, endIndex: number): SecretMatch | undefined {
  const begin = lines[beginIndex];
  if (begin === undefined || begin.next === begin.contentEnd) return undefined;
  const end = lines[endIndex];
  if (end === undefined) return undefined;
  const bodyLength = pemBodyLength(bytes.subarray(begin.next, end.start));
  const complete = bytes.subarray(begin.start, end.contentEnd);
  if (!boundedPem(bodyLength, complete.length)) return undefined;
  return { ruleId: "private-key", line: beginIndex + 1, byteOffset: begin.start, sha256: digest(complete) };
}

function pemLabel(text: string, expression: RegExp): string | undefined {
  const label = expression.exec(text)?.[1];
  return label !== undefined && PEM_LABELS.has(label) ? label : undefined;
}

function pemMatches(bytes: Buffer, lines: readonly PhysicalLine[]): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const pending = new Map<string, number>();
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]?.text ?? "";
    const begin = pemLabel(text, PEM_BEGIN);
    if (begin !== undefined) pending.set(begin, index);
    const end = pemLabel(text, PEM_END);
    if (end === undefined) continue;
    const beginIndex = pending.get(end);
    if (beginIndex === undefined) continue;
    pending.delete(end);
    const match = pemBetween(bytes, lines, beginIndex, index);
    if (match !== undefined) matches.push(match);
    if (matches.length > MAX_MATCHES) return matches;
  }
  return matches;
}

function heldBy(span: Span, offset: number): boolean {
  return offset >= span.start && offset < span.end;
}

function lineFor(lines: readonly PhysicalLine[], offset: number): number {
  let line = 1;
  for (const held of lines) {
    if (offset < held.next) return line;
    line += 1;
  }
  return line;
}

function prefixAt(bytes: Buffer, lines: readonly PhysicalLine[], start: number, held: (typeof PREFIX_BYTES)[number]): SecretMatch | undefined {
  const { rule } = held;
  if (!bytes.subarray(start, start + held.bytes.length).equals(held.bytes)) return undefined;
  let end = start + held.bytes.length;
  while (inAlphabet(bytes[end], rule.alphabet)) end += 1;
  const length = end - start;
  if (length < rule.minimum || length > rule.maximum || generic(bytes[end])) return undefined;
  return { ruleId: rule.ruleId, line: lineFor(lines, start), byteOffset: start, sha256: digest(bytes.subarray(start, end)) };
}

function prefixMatches(bytes: Buffer, lines: readonly PhysicalLine[], suppressed: readonly Span[], limit: number): SecretMatch[] {
  const matches: SecretMatch[] = [];
  for (let start = 0; start < bytes.length; start += 1) {
    if (suppressed.some((span) => heldBy(span, start)) || generic(bytes[start - 1])) continue;
    for (const held of PREFIX_BYTES) {
      const match = prefixAt(bytes, lines, start, held);
      if (match === undefined) continue;
      matches.push(match);
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}

export function detectKnownSecrets(candidate: Uint8Array): SecretDetectionResult {
  if (candidate.byteLength > MAX_CANDIDATE_BYTES) return { kind: "candidate-too-large" };
  const bytes = Buffer.from(candidate);
  if (bytes.includes(0) || !isUtf8(bytes)) return { kind: "binary" };
  const lines = physicalLines(bytes);
  const assignments = assignmentMatches(bytes, lines);
  if (assignments.matches.length > MAX_MATCHES) return { kind: "too-many-matches" };
  const keys = pemMatches(bytes, lines);
  if (assignments.matches.length + keys.length > MAX_MATCHES) return { kind: "too-many-matches" };
  const prefixes = prefixMatches(bytes, lines, assignments.spans, MAX_MATCHES + 1 - assignments.matches.length - keys.length);
  const matches = [...assignments.matches, ...keys, ...prefixes];
  if (matches.length > MAX_MATCHES) return { kind: "too-many-matches" };
  matches.sort((left, right) => left.byteOffset - right.byteOffset || (left.ruleId < right.ruleId ? -1 : left.ruleId > right.ruleId ? 1 : 0));
  return { kind: "matches", matches };
}

function validScalarText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function invalidComponent(label: string): boolean {
  return label.split("/").some((part) => part.length === 0 || part === "." || part === "..");
}

function forbiddenLabelCharacter(character: string): boolean {
  const code = character.codePointAt(0);
  if (code === undefined) return true;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
}

function validLabel(label: string): boolean {
  const invalidShape = label.length === 0 || label.startsWith("/") || label.includes("\\");
  return !invalidShape && validScalarText(label) && !invalidComponent(label) && !Array.from(label).some(forbiddenLabelCharacter);
}

function clippedLabel(label: string): string {
  if (Buffer.byteLength(label) <= 512) return label;
  let prefix = "";
  for (const character of label) {
    if (Buffer.byteLength(prefix + character) > 509) break;
    prefix += character;
  }
  return `${prefix}...`;
}

export function formatSecretMatch(label: string, match: SecretMatch): string {
  if (!validLabel(label)) return "label-invalid";
  return `secret: ${match.ruleId} at ${clippedLabel(label)}:${String(match.line)} (byte ${String(match.byteOffset)})\n`;
}
