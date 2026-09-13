import { isUtf8 } from "node:buffer";

export const GATE_MODEL_FEEDBACK_MAX = 10_000;
export const GATE_TERMINAL_FEEDBACK_MAX = 2_048;

const INVALID_UTF8 = "[Gate output is not valid UTF-8. Complete evidence: check.capture.]";

function prefix(bytes: Buffer, length: number): Buffer {
  let end = Math.min(length, bytes.length);
  while (!isUtf8(bytes.subarray(0, end))) end -= 1;
  return bytes.subarray(0, end);
}

function suffix(bytes: Buffer, length: number): Buffer {
  let start = Math.max(0, bytes.length - length);
  while (!isUtf8(bytes.subarray(start))) start += 1;
  return bytes.subarray(start);
}

function notice(total: number, omitted: number): string {
  return `\n\n[Gate output shortened: ${String(total)} bytes total; ${String(omitted)} bytes omitted. Complete evidence: check.capture.]\n\n`;
}

function boundedValid(bytes: Buffer, decoded: string, limit: number): string {
  if (bytes.length <= limit) return decoded;
  let omitted = bytes.length;
  for (;;) {
    const marker = notice(bytes.length, omitted);
    const available = limit - Buffer.byteLength(marker);
    const head = prefix(bytes, Math.floor(available / 2));
    const tail = suffix(bytes, available - head.length);
    const nextOmitted = bytes.length - head.length - tail.length;
    if (nextOmitted === omitted) return head.toString("utf8") + marker + tail.toString("utf8");
    omitted = nextOmitted;
  }
}

export function gateFeedback(bytes: Buffer): { model: string; terminal: string } {
  if (!isUtf8(bytes)) return { model: INVALID_UTF8, terminal: INVALID_UTF8 };
  const decoded = bytes.toString("utf8");
  return {
    model: boundedValid(bytes, decoded, GATE_MODEL_FEEDBACK_MAX),
    terminal: boundedValid(bytes, decoded, GATE_TERMINAL_FEEDBACK_MAX),
  };
}
