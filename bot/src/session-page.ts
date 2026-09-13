import { basename } from "node:path";
import { nothing, output, result, type InspectionResult } from "./inspection.ts";
import { hashBytes } from "./record.ts";
import { missingSession, type SessionChoice } from "./readings.ts";
import { logicalSessionEntries } from "./session-decoder.ts";
import { visitHeldSessionLines, type HeldSessionSnapshot } from "./session-lines.ts";
import { renderLogicalSessionEntry } from "./session-render.ts";

export interface SessionPageRequest { limit: number; after?: string }
interface SessionCursor { selection: string; snapshot: HeldSessionSnapshot; offset: number; ordinal: number }
interface CollectedPage { rows: string[]; bytes: number; oversized: boolean; invalidOrdinal: boolean; nextOrdinal: number }
const SESSION_CURSOR_ENCODED_BYTES = 8_192;
const SESSION_CURSOR_DECODED_BYTES = 6_144;
const RENDERED_PAGE_MAX_BYTES = 1024 * 1024;

function selectionKey(directory: string, stage: string, repeat: number | undefined, path: string): string {
  const held = [basename(directory), stage, repeat === undefined ? "" : String(repeat), path];
  return hashBytes(held.map((value) => `${String(value.length)}:${value}`).join(""));
}

function encodeCursor(cursor: SessionCursor): string {
  const { snapshot } = cursor;
  return Buffer.from([
    "2", cursor.selection, String(snapshot.device), String(snapshot.inode), String(snapshot.size),
    String(snapshot.modified), String(snapshot.changed), String(cursor.offset), String(cursor.ordinal),
  ].join("\0")).toString("base64url");
}

function cursorNumber(value: string | undefined, integer: boolean): number | undefined {
  if (value === undefined || value.length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && (!integer || Number.isSafeInteger(parsed)) ? parsed : undefined;
}

function cursorParts(value: string): string[] | undefined {
  if (Buffer.byteLength(value) > SESSION_CURSOR_ENCODED_BYTES || !/^[A-Za-z0-9_-]+$/u.test(value)) return undefined;
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length > SESSION_CURSOR_DECODED_BYTES || decoded.toString("base64url") !== value) return undefined;
  const parts = decoded.toString("utf8").split("\0");
  const version = parts[0];
  const expected = version === "1" ? 8 : version === "2" ? 9 : 0;
  return parts.length === expected && /^[a-f0-9]{64}$/u.test(parts[1] ?? "") ? parts : undefined;
}

function cursorNumbers(parts: string[]): Omit<SessionCursor, "selection"> | undefined {
  const device = cursorNumber(parts[2], true);
  if (device === undefined) return undefined;
  const inode = cursorNumber(parts[3], true);
  if (inode === undefined) return undefined;
  const size = cursorNumber(parts[4], true);
  if (size === undefined) return undefined;
  const modified = cursorNumber(parts[5], false);
  if (modified === undefined) return undefined;
  const changed = cursorNumber(parts[6], false);
  if (changed === undefined) return undefined;
  const offset = cursorNumber(parts[7], true);
  if (offset === undefined) return undefined;
  const ordinal = parts[0] === "1" ? 0 : cursorNumber(parts[8], true);
  if (ordinal === undefined) return undefined;
  return { offset, ordinal, snapshot: { device, inode, size, modified, changed } };
}

function decodeCursor(value: string): SessionCursor | undefined {
  const parts = cursorParts(value);
  if (parts === undefined) return undefined;
  const numbers = cursorNumbers(parts);
  if (numbers === undefined) return undefined;
  return { selection: parts[1] ?? "", ...numbers };
}

export function validSessionCursor(value: string): boolean {
  return decodeCursor(value) !== undefined;
}

function pageResult(
  rows: string[], stopped: "end" | "visitor" | "source", nextOffset: number,
  nextOrdinal: number, selection: string, snapshot: HeldSessionSnapshot,
): InspectionResult {
  const messages = `${String(rows.length)} ${rows.length === 1 ? "message" : "messages"}`;
  if (stopped === "end") return {
    exitCode: 0, output: output(rows),
    diagnostics: [`Showing ${messages}; reached the end of the session.`],
  };
  const after = encodeCursor({ selection, snapshot, offset: nextOffset, ordinal: nextOrdinal });
  const remains = stopped === "source" ? "more session data remains" : "more messages remain";
  return {
    exitCode: 0, output: output(rows),
    diagnostics: [`Showing ${messages}; ${remains}. Continue with --after ${after}.`],
  };
}

function unavailableSession(kind: string, choice: SessionChoice): InspectionResult | undefined {
  if (kind === "cursor-snapshot") return nothing("This session cursor names a different file snapshot.", "cursor-snapshot");
  if (kind === "cursor-position") return nothing("This session cursor position is not a source-line boundary.", "cursor-position");
  if (kind === "too-large") return nothing("This run's session is too large.", "session-too-large");
  if (kind === "held") return undefined;
  return { ...result([missingSession(choice)]), cause: kind === "missing" ? "session-missing" : "session-invalid" };
}

function selectedCursor(after: string | undefined, selection: string): { cursor?: SessionCursor } | { failed: InspectionResult } {
  const cursor = after === undefined ? undefined : decodeCursor(after);
  if (after !== undefined && cursor === undefined) return { failed: nothing("This session cursor is not valid.", "cursor-invalid") };
  if (cursor !== undefined && cursor.selection !== selection) return { failed: nothing("This session cursor belongs to a different selection.", "cursor-selection") };
  return cursor === undefined ? {} : { cursor };
}

function collectRows(page: CollectedPage, limit: number, resumedOrdinal: number) {
  let firstLine = true;
  return (raw: string): boolean => {
    const entries = logicalSessionEntries(raw);
    const start = firstLine ? resumedOrdinal : 0;
    firstLine = false;
    if (start > 0 && start >= entries.length) { page.invalidOrdinal = true; return false; }
    for (let ordinal = start; ordinal < entries.length; ordinal += 1) {
      const logical = entries[ordinal];
      if (logical === undefined) continue;
      const line = renderLogicalSessionEntry(logical);
      if (line === undefined) continue;
      const bytes = Buffer.byteLength(line) + 1;
      if (bytes > RENDERED_PAGE_MAX_BYTES) { page.oversized = true; page.nextOrdinal = ordinal; return false; }
      if (page.rows.length >= limit || page.bytes + bytes > RENDERED_PAGE_MAX_BYTES) {
        page.nextOrdinal = ordinal;
        return false;
      }
      page.rows.push(line);
      page.bytes += bytes;
    }
    page.nextOrdinal = 0;
    return true;
  };
}

function invalidResumedOrdinal(
  page: CollectedPage, cursor: SessionCursor | undefined, stopped: "end" | "visitor" | "source", nextOffset: number,
): boolean {
  if (page.invalidOrdinal) return true;
  if (cursor === undefined || cursor.ordinal === 0 || stopped !== "end") return false;
  return nextOffset === cursor.offset;
}

function cursorRead(cursor: SessionCursor | undefined): { offset: number; ordinal: number; snapshot?: HeldSessionSnapshot } {
  return cursor === undefined
    ? { offset: 0, ordinal: 0 }
    : { offset: cursor.offset, ordinal: cursor.ordinal, snapshot: cursor.snapshot };
}

export async function readSessionPage(
  directory: string, stage: string, repeat: number | undefined, choice: SessionChoice, page: SessionPageRequest,
): Promise<InspectionResult> {
  const selection = selectionKey(directory, stage, repeat, choice.path);
  const selected = selectedCursor(page.after, selection);
  if ("failed" in selected) return selected.failed;
  const { cursor } = selected;
  const resumed = cursorRead(cursor);
  const collected: CollectedPage = { rows: [], bytes: 0, oversized: false, invalidOrdinal: false, nextOrdinal: 0 };
  const held = await visitHeldSessionLines(
    directory, choice.path, resumed.offset, resumed.snapshot, collectRows(collected, page.limit, resumed.ordinal),
  );
  const unavailable = unavailableSession(held.kind, choice);
  if (unavailable !== undefined || held.kind !== "held") return unavailable ?? result([missingSession(choice)]);
  if (invalidResumedOrdinal(collected, cursor, held.stopped, held.nextOffset)) {
    return nothing("This session cursor ordinal is not valid for its source line.", "cursor-ordinal");
  }
  if (collected.oversized) return nothing("This run's session contains a message too large to render.", "session-too-large");
  return pageResult(collected.rows, held.stopped, held.nextOffset, collected.nextOrdinal, selection, held.snapshot);
}
