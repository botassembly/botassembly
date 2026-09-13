import { inspect } from "node:util";
import { mapping, plainly } from "./model.ts";
import type { LogicalSessionEntry } from "./session-decoder.ts";

function oneLine(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/\r/gu, "\\r").replace(/\n/gu, "\\n");
}

function contentBlock(value: unknown): string | undefined {
  if (!mapping(value)) return undefined;
  const block = value;
  const type = block["type"];
  if (type === "text" && typeof block["text"] === "string") return block["text"];
  if (type === "thinking" && typeof block["thinking"] === "string") return `thinking ${block["thinking"]}`;
  if (type === "toolCall" && typeof block["name"] === "string") {
    return `call ${block["name"]} ${inspect(block["arguments"], { breakLength: Infinity, compact: true })}`;
  }
  if (type === "image") return "[image]";
  return undefined;
}

function content(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map(contentBlock).filter((part) => part !== undefined).join(" | ");
}

export function renderLogicalSessionEntry(logical: LogicalSessionEntry): string | undefined {
  const { entry } = logical;
  if (entry["type"] !== "message") return undefined;
  const held = entry["message"];
  if (!mapping(held)) return undefined;
  const message = held;
  const messageRole = message["role"];
  if (typeof messageRole !== "string") return undefined;
  const role = message["role"] === "toolResult" && typeof message["toolName"] === "string"
    ? `tool:${message["toolName"]}${message["isError"] === true ? ":error" : ":ok"}`
    : messageRole;
  return plainly(`${logical.displayTimestamp}  ${role}  ${oneLine(content(message["content"]))}`);
}
