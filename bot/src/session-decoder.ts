import { parseDocument } from "yaml";
import { mapping } from "./model.ts";

export interface LogicalSessionEntry {
  entry: Record<string, unknown>;
  timestamp: number;
  displayTimestamp: string;
}

function parsedLine(raw: string): unknown {
  if (raw.length === 0) return undefined;
  const document = parseDocument(raw);
  return document.errors.length === 0 ? document.toJS() as unknown : undefined;
}

function directEntry(value: Record<string, unknown>): LogicalSessionEntry {
  const displayTimestamp = typeof value["timestamp"] === "string" ? value["timestamp"] : "-";
  return {
    entry: value,
    timestamp: typeof value["timestamp"] === "string" ? Date.parse(value["timestamp"]) : Number.NaN,
    displayTimestamp,
  };
}

function committedEntry(value: unknown): LogicalSessionEntry | undefined {
  if (!mapping(value) || value["kind"] !== "entry") return undefined;
  const seq = value["seq"];
  const timestamp = value["timestamp"];
  if (!Number.isSafeInteger(seq) || Number(seq) < 1 || !Number.isSafeInteger(timestamp) || Number(timestamp) < 0) return undefined;
  const date = new Date(Number(timestamp));
  if (!Number.isFinite(date.getTime())) return undefined;
  return { entry: value, timestamp: Number(timestamp), displayTimestamp: date.toISOString() };
}

/** Decode one physical session line while retaining invalid or non-entry item positions. */
function logicalSessionItems(raw: string): (LogicalSessionEntry | undefined)[] {
  const value = parsedLine(raw);
  if (Array.isArray(value)) return value.map(committedEntry);
  if (!mapping(value)) return [undefined];
  if ("kind" in value) {
    const entry = committedEntry(value);
    return [entry];
  }
  return [directEntry(value)];
}

/** Decode one physical session line into its ordered retained entry writes. */
export function logicalSessionEntries(raw: string): LogicalSessionEntry[] {
  return logicalSessionItems(raw).filter((entry) => entry !== undefined);
}

/** Decode one direct entry without unpacking a transaction array. */
export function logicalDirectSessionEntry(raw: string): LogicalSessionEntry | undefined {
  const value = parsedLine(raw);
  if (!mapping(value)) return undefined;
  return "kind" in value ? committedEntry(value) : directEntry(value);
}

interface PendingTool { name: string; started: number; target?: string }

export interface DecodedSettledTool {
  identity: string;
  name: string;
  failed: boolean;
  duration: number;
  settledAt: number;
  resultBytes: number;
  target?: string;
}

function primaryTarget(name: string, value: unknown): string | undefined {
  if (!mapping(value)) return undefined;
  const key = name === "bash" ? "command" : ["read", "write", "edit"].includes(name) ? "path" : undefined;
  const target = key === undefined ? undefined : value[key];
  return typeof target === "string" ? target : undefined;
}

function rememberTools(message: Record<string, unknown>, started: number, pending: Map<string, PendingTool>): void {
  if (message["role"] !== "assistant" || !Array.isArray(message["content"])) return;
  for (const value of message["content"]) {
    if (!mapping(value) || value["type"] !== "toolCall" || typeof value["id"] !== "string" || typeof value["name"] !== "string") continue;
    const target = primaryTarget(value["name"], value["arguments"]);
    pending.set(value["id"], { name: value["name"], started, ...(target === undefined ? {} : { target }) });
  }
}

function resultBytes(value: unknown): number {
  if (typeof value === "string") return Buffer.byteLength(value);
  if (!Array.isArray(value)) return 0;
  let total = 0;
  for (const block of value) {
    if (mapping(block) && block["type"] === "text" && typeof block["text"] === "string") total += Buffer.byteLength(block["text"]);
  }
  return total;
}

function settleTool(
  logical: LogicalSessionEntry, pending: Map<string, PendingTool>, identity: string,
): DecodedSettledTool | undefined {
  const message = logical.entry["type"] === "message" && mapping(logical.entry["message"])
    ? logical.entry["message"] : undefined;
  if (message === undefined || !Number.isFinite(logical.timestamp)) return undefined;
  rememberTools(message, logical.timestamp, pending);
  const callId = message["toolCallId"];
  if (message["role"] !== "toolResult" || typeof callId !== "string" || typeof message["isError"] !== "boolean") return undefined;
  const call = pending.get(callId);
  if (call === undefined) return undefined;
  pending.delete(callId);
  return {
    identity, name: call.name, failed: message["isError"], duration: Math.max(0, logical.timestamp - call.started),
    settledAt: logical.timestamp, resultBytes: resultBytes(message["content"]),
    ...(call.target === undefined ? {} : { target: call.target }),
  };
}

function identity(stage: string, repeat: number | undefined): string {
  return repeat === undefined ? stage : `${stage}#${String(repeat)}`;
}

export function settledLogicalSessionTools(source: string, stage: string, repeat?: number): DecodedSettledTool[] {
  const read = settledSessionLineToolReader(stage, repeat);
  return source.split("\n").flatMap(read);
}

export function settledDirectSessionToolReader(
  stage: string, repeat?: number,
): (raw: string) => DecodedSettledTool | undefined {
  const pending = new Map<string, PendingTool>();
  const heldIdentity = identity(stage, repeat);
  return (raw) => {
    const entry = logicalDirectSessionEntry(raw);
    return entry === undefined ? undefined : settleTool(entry, pending, heldIdentity);
  };
}

export function settledSessionLineToolReader(
  stage: string, repeat?: number,
): (raw: string) => DecodedSettledTool[] {
  const pending = new Map<string, PendingTool>();
  const heldIdentity = identity(stage, repeat);
  return (raw) => logicalSessionEntries(raw)
    .map((entry) => settleTool(entry, pending, heldIdentity)).filter((call) => call !== undefined);
}
