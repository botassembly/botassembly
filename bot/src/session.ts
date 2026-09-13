import { plainly } from "./model.ts";
import {
  logicalDirectSessionEntry, logicalSessionEntries, settledDirectSessionToolReader, settledLogicalSessionTools,
} from "./session-decoder.ts";
import { renderLogicalSessionEntry } from "./session-render.ts";

const MAX_SESSION_LINES = 10_000;

// Count transcript lines before making a split array. A final newline
// terminates its preceding line and does not create another one.
export function withinSessionLineLimit(source: string): boolean {
  if (source.length === 0) return true;
  let lines = source.endsWith("\n") ? 0 : 1;
  for (const character of source) {
    if (character !== "\n") continue;
    lines += 1;
    if (lines > MAX_SESSION_LINES) return false;
  }
  return true;
}

/** Render one complete retained session entry with the same tolerant rules as the whole-session reader. */
export function renderSessionEntry(raw: string): string | undefined {
  const entry = logicalDirectSessionEntry(raw);
  return entry === undefined ? undefined : renderLogicalSessionEntry(entry);
}

function renderSessionEntries(raw: string): string[] {
  return logicalSessionEntries(raw).map(renderLogicalSessionEntry).filter((line) => line !== undefined);
}

/** Render Pi's pinned JSONL session as one stable, human-readable line per message. */
export function renderSession(source: string): string[] {
  if (!withinSessionLineLimit(source)) return [];
  const lines: string[] = [];
  for (const raw of source.split("\n")) {
    lines.push(...renderSessionEntries(raw));
  }
  return lines;
}

export interface SettledTool {
  identity: string;
  name: string;
  failed: boolean;
  duration: number;
  settledAt: number;
  resultBytes: number;
  target?: string;
}

/** Read every settled Pi tool call with its recorded outcome and duration. */
export function settledSessionTools(source: string, stage: string, repeat?: number): SettledTool[] {
  if (!withinSessionLineLimit(source)) return [];
  return settledLogicalSessionTools(source, stage, repeat);
}

/** Incremental counterpart of `settledSessionTools` for a transcript too large to hold whole. */
export function settledSessionToolReader(
  stage: string, repeat?: number,
): (raw: string) => SettledTool | undefined {
  return settledDirectSessionToolReader(stage, repeat);
}

function targetSummary(target: string): string {
  const first = target.split(/[\r\n]/u, 1)[0] ?? "";
  const characters = Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(plainly(first)), ({ segment }) => segment);
  return characters.length > 120 ? `${characters.slice(0, 119).join("")}…` : first;
}

export function renderSettledTool(call: SettledTool, summaries = false): string {
  const target = summaries && call.target !== undefined ? `  ${targetSummary(call.target)}` : "";
  return plainly(`${call.identity}  ${call.name}  ${call.failed ? "failed" : "ok"}  ${String(call.duration)}ms${target}`);
}

/** Render every settled Pi tool call with its recorded outcome and duration. */
export function renderSessionTools(source: string, stage: string, repeat?: number): string[] {
  return settledSessionTools(source, stage, repeat).map((call) => renderSettledTool(call));
}
