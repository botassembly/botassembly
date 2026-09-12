import { jsonObject } from "./check.ts";
import { NEW_COMMAND_ERROR_BYTES } from "./cli-contract.ts";
import { plainly } from "./model.ts";
import type { CliFailure } from "./run-list-query.ts";

export interface CommandResult<Exit extends number = 0 | 1 | 2 | 3 | 4 | 5> { exit: Exit; stdout: Buffer; stderr: Buffer }
export interface InertText { text: string; omitted: number }

export function boundedText(value: string, bytes = 2_048): string {
  const raw = Buffer.from(value);
  if (raw.length <= bytes) return value;
  let end = bytes - Buffer.byteLength("…");
  while (end > 0 && (raw[end] ?? 0) >= 0x80 && (raw[end] ?? 0) < 0xc0) end -= 1;
  return `${raw.subarray(0, end).toString("utf8")}…`;
}

function prefix(raw: Buffer, maximum: number): Buffer {
  let end = maximum;
  while (end > 0 && (raw[end] ?? 0) >= 0x80 && (raw[end] ?? 0) < 0xc0) end -= 1;
  return raw.subarray(0, end);
}

function clipping(raw: Buffer, maximum: number, omitted: number): InertText {
  let notice = `…[${String(omitted)} bytes omitted]`;
  let head = prefix(raw, maximum - Buffer.byteLength(notice));
  const actual = raw.length - head.length;
  if (actual !== omitted) return clipping(raw, maximum, actual);
  notice = `…[${String(omitted)} bytes omitted]`;
  head = prefix(raw, maximum - Buffer.byteLength(notice));
  return { text: `${head.toString("utf8")}${notice}`, omitted };
}

export function inertText(value: string, maximum = 480): InertText {
  const controls = plainly(value).replace(/[\t\r\n]/gu, (held) => `\\x${(held.codePointAt(0) ?? 0).toString(16).padStart(2, "0")}`);
  const safe = controls.replaceAll("\\", "\\\\").replaceAll("|", "\\|")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const raw = Buffer.from(safe);
  return raw.length <= maximum ? { text: safe, omitted: 0 } : clipping(raw, maximum, raw.length - maximum);
}

export function newCommandFailure(operation: string, held: CliFailure, json: boolean): CommandResult {
  const message = boundedText(held.message);
  const rendered = json ? jsonObject({ schemaVersion: 1, kind: "error", error: {
    code: held.code, operation, cause: held.cause, message, retryable: held.retryable, details: held.details,
  } }) : message;
  return { exit: held.exit, stdout: Buffer.alloc(0), stderr: Buffer.from(`${json ? rendered : inertText(rendered, NEW_COMMAND_ERROR_BYTES).text}\n`) };
}
