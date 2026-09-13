// Turning a run directory into the record's lines, or into the word for why it
// could not be: the seam Ian ruled (0087) is "turn a file into record lines",
// and this module is exactly that seam and nothing else. It holds the ONE
// CatchClause the runtime allows for reading a record, which is why it is a
// file of its own — the NO_CATCH allowlist in eslint.config.js now exempts this
// boundary rather than the whole of the lens that reads (ticket 0099).
// record-events.ts builds the lines the writer appends; this reads them back.
import { basename } from "node:path";
import { errorCode, mapping } from "./model.ts";
import { visitHeldRecordLines } from "./run-files.ts";
import { classifyStory, type RecordClassification } from "./record-story.ts";

export interface HeldRecord {
  events: Record<string, unknown>[];
  lines: string[];
  classification?: RecordClassification;
  notice?: string;
  source?: { mtime: number; size: number };
  /** Why the record could not be read: the word the listing marks the entry with, and the sentence stderr gets. */
  fault?: { mark: string; says: string };
}

const CURRENT_RECORD_VERSION = 1;

const unread = (mark: string, says: string): HeldRecord => ({ events: [], lines: [], fault: { mark, says } });

// One mark, several repairs, so the SENTENCE carries the cause the mark cannot:
// the code the throw carried, not the platform's message, because the code is
// what a person greps for and the message is free to be reworded between
// releases (refusals.md) and repeats the path this sentence already names.
// `errorCode` narrows without a cast (NO_CAST holds here), and it is the one
// place this runtime reads a code off a throw (CHECKLIST 9).
function unreadable(directory: string, error: unknown): HeldRecord {
  const code = errorCode(error);
  // A throw with no code names NO cause rather than an invented one: `unreadable`
  // is every throw before heldRecord's loop, whose codes are not a closed set.
  const cause = code === undefined ? "" : `: ${code}`;
  return unread("unreadable", `The record in ${directory} cannot be read${cause}.`);
}

/** A field of a record event as a reading prints it: absent, or of a type no
 *  listing column can carry, reads `-` — "blank is a true answer" (inspection.md). */
export function field(event: Record<string, unknown>, name: string): string {
  const value = event[name];
  return typeof value === "string" || typeof value === "number" ? String(value) : "-";
}

function badVersion(directory: string, named: string): HeldRecord {
  return unread("bad-version", `The record in ${directory} says it is in record format ${named}; this bot reads record format ${String(CURRENT_RECORD_VERSION)}. To read that run you need a bot that speaks format ${named}.`);
}

// The first line names this pre-release record shape. There are no migrations:
// an unsupported shape is refused, and additive fields remain readable.
function shapedRecord(events: Record<string, unknown>[], lines: string[], directory: string): HeldRecord | undefined {
  const first = events[0];
  if (first === undefined) return undefined;
  const version = first["record"];
  return typeof version === "number" && version !== CURRENT_RECORD_VERSION
    ? badVersion(directory, String(version)) : undefined;
}

// The record is JSONL — "one JSON object per line" (invariant 16) — so a line
// is read by the parser that enforces it, never a superset: `record: 1`, which
// the writer could not produce, is YAML. Holding the bytes as a string throws
// (past ~512 MB there is no such string), JSON.parse throws; Ian ruled (0087)
// the seam is "turn a file into record lines", so ONE catch spans them
// (allowlisted, 0083) and `index` sorts what it caught — 0 is every throw
// before the loop, whatever threw. The held-file boundary classifies nothing
// there, or a link to nothing, as `no-record` (0075); a real link and anything
// it cannot safely hold as `unreadable`; and a non-file as `bad-record`, never
// opened, so a FIFO cannot block the read. Bytes it did obtain that are not a
// record — invalid UTF-8, a line that is not a JSON object — is `bad-record`
// (0080), except a torn last one, "one event rather than the file" (record.md).
interface ParsedLine { line: string; event?: Record<string, unknown>; rule?: string }

function parsedLine(line: string, index: number): ParsedLine {
  try {
    const value: unknown = JSON.parse(line);
    return mapping(value)
      ? { line, event: value }
      : { line, rule: `Record line ${String(index)} is not an object` };
  } catch {
    return { line, rule: `Invalid record line ${String(index)}` };
  }
}

function invalidStory(directory: string, line: number, rule: string, lines: string[]): HeldRecord {
  return {
    classification: "invalid", events: [], lines,
    fault: { mark: "invalid", says: `Record line ${String(line)} violates rule: ${rule} in ${directory}.` },
  };
}

function firstSemanticFault(
  framing: { line: number; rule: string } | undefined, story: { line: number; rule: string } | undefined,
): { line: number; rule: string } | undefined {
  if (framing === undefined) return story;
  if (story === undefined) return framing;
  return story.line < framing.line ? story : framing;
}

function classifiedRecord(
  classification: RecordClassification, events: Record<string, unknown>[], lines: string[], directory: string, torn?: number,
): HeldRecord {
  if (torn !== undefined && classification === "valid") {
    return invalidStory(directory, torn, "content follows run_end", lines);
  }
  const notice = torn === undefined ? undefined
    : `Record line ${String(torn)} in ${directory} is an unterminated torn segment and was omitted.`;
  return { classification, events, lines, ...(notice === undefined ? {} : { notice }) };
}

function semanticRecord(directory: string, events: Record<string, unknown>[], eventLines: number[], lines: string[], framing?: { line: number; rule: string }, torn?: number, expectedRun = basename(directory), allowSubflow = false): HeldRecord {
  if (framing?.line === 1) return invalidStory(directory, 1, framing.rule, lines);
  const unsupported = shapedRecord(events, lines, directory);
  if (unsupported !== undefined) return unsupported;
  const story = classifyStory(events, eventLines, expectedRun, allowSubflow);
  const first = firstSemanticFault(framing, story.rejected);
  if (first !== undefined) return invalidStory(directory, first.line, first.rule, lines);
  return classifiedRecord(story.classification, events, lines, directory, torn);
}

interface ParsedRecord {
  events: Record<string, unknown>[];
  eventLines: number[];
  lines: string[];
  framing?: { line: number; rule: string };
}

function appendParsedLine(parsed: ParsedRecord, line: string, index: number): void {
  const result = parsedLine(line, index);
  if (result.event !== undefined) {
    parsed.events.push(result.event);
    parsed.eventLines.push(index);
    parsed.lines.push(result.line);
  } else if (parsed.framing === undefined) {
    parsed.framing = { line: index, rule: result.rule ?? `Invalid record line ${String(index)}` };
  }
}

async function readHeldRecord(directory: string, path: string, expectedRun?: string, allowSubflow = false): Promise<HeldRecord | undefined> {
  const parsed: ParsedRecord = { events: [], eventLines: [], lines: [] };
  const held = await visitHeldRecordLines(directory, path, (line, index) => { appendParsedLine(parsed, line, index); });
  if (held.kind === "missing" || held.kind === "dangling-link") return undefined;
  if (held.kind === "non-file") return unread("bad-record", `The record in ${directory} is not a file.`);
  if (held.kind === "too-large") return unread("unreadable", `The record in ${directory} is too large.`);
  if (held.kind === "bad-utf8") return unread("bad-record", `The record in ${directory} is not valid UTF-8.`);
  if (held.kind === "unreadable") return unreadable(directory, held.error);
  return {
    ...semanticRecord(directory, parsed.events, parsed.eventLines, parsed.lines, parsed.framing, held.torn, expectedRun, allowSubflow),
    source: { mtime: held.mtime, size: held.size },
  };
}

export function heldRecord(directory: string, path?: string): Promise<HeldRecord | undefined> {
  if (path === undefined) return readHeldRecord(directory, "record.jsonl", basename(directory));
  const parts = path.split("/");
  parts.pop();
  return readHeldRecord(directory, path, parts.at(-1), true);
}
