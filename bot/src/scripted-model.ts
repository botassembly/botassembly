// A scripted caller response follows the faux provider's assistant-message
// shape, so production runs use the same queue and turn machinery as tests.
import { fauxAssistantMessage, type AssistantMessage, type FauxContentBlock } from "@earendil-works/pi-ai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapping } from "./model.ts";

function scriptedBlock(value: unknown): value is FauxContentBlock {
  if (!mapping(value)) return false;
  if (value["type"] === "text") return typeof value["text"] === "string";
  if (value["type"] === "thinking") return typeof value["thinking"] === "string";
  return value["type"] === "toolCall"
    && typeof value["id"] === "string"
    && typeof value["name"] === "string"
    && mapping(value["arguments"]);
}

function scriptedItem(value: unknown): value is string | FauxContentBlock[] {
  return typeof value === "string" || (Array.isArray(value) && value.every(scriptedBlock));
}

export function scriptedMessages(file: string, cwd: string): AssistantMessage[] {
  const parsed: unknown = JSON.parse(readFileSync(resolve(cwd, file), "utf8")) as unknown;
  if (!Array.isArray(parsed) || !parsed.every(scriptedItem)) throw new TypeError("The model script has invalid content.");
  return parsed.map((item) => fauxAssistantMessage(item));
}
