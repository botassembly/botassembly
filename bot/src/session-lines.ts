import type { Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { inspectHeldRunFile, type HeldRunFile } from "./run-files.ts";

const LOG_LINE_MAX_BYTES = 16 * 1024 * 1024;
const LINE_MAX_COUNT = 1_000_000;
const PAGE_LINE_MAX_BYTES = 1024 * 1024;
const PAGE_SOURCE_TARGET = 4 * 1024 * 1024;
const READ_BYTES = 64 * 1024;

export type HeldRunLines = Exclude<HeldRunFile, { kind: "held" }> | { kind: "held"; mtime: number; size: number };

export interface HeldSessionSnapshot {
  device: number;
  inode: number;
  size: number;
  modified: number;
  changed: number;
}

export type HeldSessionLines =
  | Exclude<HeldRunFile, { kind: "held" }>
  | { kind: "cursor-snapshot" }
  | { kind: "cursor-position" }
  | { kind: "held"; snapshot: HeldSessionSnapshot; ended: boolean; stopped: "end" | "visitor" | "source"; nextOffset: number };

type VisitLine = (line: string, startOffset: number, nextOffset: number) => boolean;
interface ScanState { carry: Buffer; lineStart: number; lines: number }
interface ScanResult { kind: "read"; stopped: "end" | "visitor" | "source"; nextOffset: number }

function snapshot(held: Stats): HeldSessionSnapshot {
  return { device: held.dev, inode: held.ino, size: held.size, modified: held.mtimeMs, changed: held.ctimeMs };
}

function sameSnapshot(actual: HeldSessionSnapshot, expected: HeldSessionSnapshot): boolean {
  return actual.device === expected.device && actual.inode === expected.inode && actual.size === expected.size
    && actual.modified === expected.modified && actual.changed === expected.changed;
}

async function lineBoundary(descriptor: FileHandle, offset: number): Promise<boolean> {
  if (offset === 0) return true;
  const byte = Buffer.alloc(1);
  const read = await descriptor.read(byte, 0, 1, offset - 1);
  return read.bytesRead === 1 && byte[0] === 0x0a;
}

function publishLines(
  state: ScanState, chunk: Buffer, sourceStart: number, sourceTarget: number, lineMax: number, size: number, visit: VisitLine,
): { state: ScanState; result?: ScanResult | { kind: "too-large" } } {
  let carry = state.carry.length === 0 ? chunk : Buffer.concat([state.carry, chunk]);
  let lineStart = state.lineStart;
  let lines = state.lines;
  let newline = carry.indexOf(0x0a);
  while (newline >= 0) {
    lines += 1;
    if (lines > LINE_MAX_COUNT || logicalBytes(carry, newline) > lineMax) return { state, result: { kind: "too-large" } };
    const nextOffset = lineStart + newline + 1;
    const line = carry.subarray(0, newline).toString("utf8").replace(/\r$/u, "");
    if (!visit(line, lineStart, nextOffset)) return { state, result: { kind: "read", stopped: "visitor", nextOffset: lineStart } };
    carry = carry.subarray(newline + 1);
    lineStart = nextOffset;
    if (nextOffset - sourceStart >= sourceTarget && nextOffset < size) {
      return { state: { carry, lineStart, lines }, result: { kind: "read", stopped: "source", nextOffset } };
    }
    newline = carry.indexOf(0x0a);
  }
  const next = { carry, lineStart, lines };
  return logicalBytes(carry, carry.length) > lineMax ? { state: next, result: { kind: "too-large" } } : { state: next };
}

function logicalBytes(bytes: Buffer, end: number): number {
  return end > 0 && bytes[end - 1] === 0x0d ? end - 1 : end;
}

async function scanLines(
  descriptor: FileHandle, size: number, offset: number, sourceTarget: number, lineMax: number, visit: VisitLine,
): Promise<ScanResult | { kind: "too-large" } | { kind: "unreadable" }> {
  let state: ScanState = { carry: Buffer.alloc(0), lineStart: offset, lines: 0 };
  let position = offset;
  while (position < size) {
    const bytes = Buffer.alloc(Math.min(READ_BYTES, size - position));
    const read = await descriptor.read(bytes, 0, bytes.length, position);
    if (read.bytesRead === 0) return { kind: "unreadable" };
    position += read.bytesRead;
    const published = publishLines(state, bytes.subarray(0, read.bytesRead), offset, sourceTarget, lineMax, size, visit);
    state = published.state;
    if (published.result !== undefined) return published.result;
  }
  if (state.carry.length === 0) return { kind: "read", stopped: "end", nextOffset: size };
  if (state.lines + 1 > LINE_MAX_COUNT || logicalBytes(state.carry, state.carry.length) > lineMax) return { kind: "too-large" };
  return visit(state.carry.toString("utf8").replace(/\r$/u, ""), state.lineStart, size)
    ? { kind: "read", stopped: "end", nextOffset: size }
    : { kind: "read", stopped: "visitor", nextOffset: state.lineStart };
}

type SessionRead =
  | { kind: "cursor-snapshot" | "cursor-position" | "too-large" | "unreadable" }
  | { kind: "read"; snapshot: HeldSessionSnapshot; result: ScanResult };

async function inspectSessionLines(
  descriptor: FileHandle, observed: Stats, offset: number, expected: HeldSessionSnapshot | undefined, visit: VisitLine,
): Promise<SessionRead> {
  const held = snapshot(observed);
  if (expected !== undefined && !sameSnapshot(held, expected)) return { kind: "cursor-snapshot" };
  if (offset < 0 || offset > observed.size || !await lineBoundary(descriptor, offset)) return { kind: "cursor-position" };
  const result = await scanLines(descriptor, observed.size, offset, PAGE_SOURCE_TARGET, PAGE_LINE_MAX_BYTES, visit);
  return result.kind === "read" ? { kind: "read", snapshot: held, result } : result;
}

/** Visit one bounded rendered-session candidate page from one fixed held snapshot. */
export async function visitHeldSessionLines(
  directory: string, path: string, offset: number, expected: HeldSessionSnapshot | undefined, visit: VisitLine,
): Promise<HeldSessionLines> {
  const read = await inspectHeldRunFile(directory, path, (descriptor, observed) =>
    inspectSessionLines(descriptor, observed, offset, expected, visit));
  if (read.kind !== "held") return read;
  const result = read.value;
  if (result.kind !== "read") return result;
  return {
    kind: "held", snapshot: result.snapshot, ended: result.result.stopped === "end",
    stopped: result.result.stopped, nextOffset: result.result.nextOffset,
  };
}

/** Visit every bounded source line for tool summaries through the same scanner. */
export async function visitHeldRunLines(
  directory: string, path: string, visit: (line: string) => void,
): Promise<HeldRunLines> {
  const read = await inspectHeldRunFile(directory, path, (descriptor, observed) =>
    scanLines(descriptor, observed.size, 0, Number.POSITIVE_INFINITY, LOG_LINE_MAX_BYTES, (line) => { visit(line); return true; }));
  if (read.kind !== "held") return read;
  return read.value.kind === "read"
    ? { kind: "held", mtime: read.observed.mtimeMs, size: read.observed.size }
    : { kind: "too-large" };
}
