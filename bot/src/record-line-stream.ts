import { isUtf8 } from "node:buffer";
import type { FileHandle } from "node:fs/promises";

const RECORD_MAX_SEGMENTS = 10_000;
const RECORD_READ_BYTES = 64 * 1024;

export type StreamedRecordLines =
  | { kind: "read"; torn?: number }
  | { kind: "bad-utf8" }
  | { kind: "too-large" }
  | { kind: "unreadable"; error?: unknown };

async function readChunk(descriptor: FileHandle, position: number, length: number): Promise<Buffer | undefined> {
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const read = await descriptor.read(bytes, offset, length - offset, position + offset);
    if (read.bytesRead === 0) return undefined;
    offset += read.bytesRead;
  }
  return bytes;
}

type ContentFailure = Extract<StreamedRecordLines, { kind: "bad-utf8" | "too-large" }>;
interface LineState { carry: Buffer; segments: number; content?: ContentFailure }

function publishChunk(state: LineState, chunk: Buffer, visit: (line: string, index: number) => void): LineState {
  let carry = state.carry.length === 0 ? chunk : Buffer.concat([state.carry, chunk]);
  let segments = state.segments;
  let newline = carry.indexOf(0x0a);
  while (newline >= 0) {
    segments += 1;
    if (segments > RECORD_MAX_SEGMENTS) return { carry, segments, content: { kind: "too-large" } };
    const line = carry.subarray(0, newline);
    if (!isUtf8(line)) return { carry, segments, content: { kind: "bad-utf8" } };
    visit(line.toString("utf8"), segments);
    carry = carry.subarray(newline + 1);
    newline = carry.indexOf(0x0a);
  }
  return { carry, segments };
}

function finishLines(state: LineState): StreamedRecordLines {
  if (state.content !== undefined) return state.content;
  if (state.carry.length === 0) return { kind: "read" };
  const segments = state.segments + 1;
  if (segments > RECORD_MAX_SEGMENTS) return { kind: "too-large" };
  return isUtf8(state.carry) ? { kind: "read", torn: segments } : { kind: "bad-utf8" };
}

export async function streamRecordLines(
  descriptor: FileHandle, size: number, visit: (line: string, index: number) => void,
): Promise<StreamedRecordLines> {
  let state: LineState = { carry: Buffer.alloc(0), segments: 0 };
  let position = 0;
  while (position < size) {
    const length = Math.min(RECORD_READ_BYTES, size - position);
    const result = await readChunk(descriptor, position, length).then(
      (chunk) => ({ chunk }),
      (error: unknown) => ({ error }),
    );
    if ("error" in result) return { kind: "unreadable", error: result.error };
    const { chunk } = result;
    if (chunk === undefined) return { kind: "unreadable" };
    position += chunk.length;
    if (state.content === undefined) state = publishChunk(state, chunk, visit);
  }
  return finishLines(state);
}
