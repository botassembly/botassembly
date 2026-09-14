// Ticket 0293. inspection.md's "bot capabilities" subsection promises "The
// inventory contains" a sentence naming every operation the executable
// implements. The sentence once fell out of step with the code silently: the
// runtime added `auth.import` and the chapter kept the old list. This file
// pins the chapter's sentence to CLI_CONTRACTS in both directions, the way
// spec-error-vocabulary.test.ts pins the error codes and causes.
// Nothing here scans other source text: the extraction is one prose span.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { CLI_CONTRACTS } from "../src/cli-contract.ts";
import { bytewise } from "../src/model.ts";

const INSPECTION = new URL("../../specification/elements/inspection.md", import.meta.url).pathname;

/** The backticked operation names in the chapter's inventory sentence, in the
 *  order the chapter states them. */
function chapterOperations(): string[] {
  const chapter = readFileSync(INSPECTION, "utf8");
  const commands = chapter.split(/^## /mu).find((part) => part.startsWith("The commands"));
  expect(commands, 'inspection.md has no "The commands" section').toBeDefined();
  const start = (commands ?? "").indexOf("The inventory contains");
  expect(start, '"The commands" has no "The inventory contains" sentence').toBeGreaterThanOrEqual(0);
  const rest = (commands ?? "").slice(start);
  const end = rest.indexOf("`.");
  expect(end, "the inventory sentence never reaches a name followed by a period").toBeGreaterThanOrEqual(0);
  const sentence = rest.slice(0, end + 2);
  return [...sentence.matchAll(/`([a-z][a-z0-9.]*)`/gu)].map((match) => String(match[1]));
}

test("the chapter names every operation CLI_CONTRACTS holds", () => {
  const chapter = chapterOperations();
  expect(chapter.length, "the inventory sentence read as empty").toBeGreaterThan(20);
  const operations = CLI_CONTRACTS.map((descriptor) => descriptor.operation);
  expect(operations.filter((operation) => !chapter.includes(operation))).toEqual([]);
});

test("the chapter names no operation CLI_CONTRACTS does not hold", () => {
  const chapter = chapterOperations();
  expect(chapter.length, "the inventory sentence read as empty").toBeGreaterThan(20);
  const operations = new Set<string>(CLI_CONTRACTS.map((descriptor) => descriptor.operation));
  expect(chapter.filter((operation) => !operations.has(operation))).toEqual([]);
});

test("the inventory sentence holds 26 names with no duplicate", () => {
  const chapter = chapterOperations();
  expect(chapter.length).toBe(26);
  expect(new Set(chapter).size).toBe(chapter.length);
});

test("the inventory sentence is sorted", () => {
  const chapter = chapterOperations();
  expect(chapter).toEqual([...chapter].sort(bytewise));
});
