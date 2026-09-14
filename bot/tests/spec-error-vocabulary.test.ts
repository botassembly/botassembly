// Ticket 0282, unspecified behavior U1. inspection.md promised a JSON error
// with "a stable code and cause" and named three of them. A program written
// against `bot --json` had to read bot/src to learn what to branch on.
//
// The vocabularies are now closed in spine.ts and documented in
// inspection.md's "The JSON error envelope", and this file pins them to each
// other in both directions, the way spec-vocabulary.test.ts pins refusals.md
// to REFUSAL_CODES. A declared code or cause the chapter does not name is red,
// and a code or cause the chapter names that no CliFailure can draw is red.
// Nothing here scans source text: the vocabulary is the exported value, and
// TypeScript is what keeps every CliFailure inside it.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { bytewise } from "../src/model.ts";
import { CAUSES, ERROR_CAUSES, ERROR_CODES } from "../src/spine.ts";

const INSPECTION = new URL("../../specification/elements/inspection.md", import.meta.url).pathname;

/** One `## `-delimited chapter section, by its heading. */
function section(heading: string): string {
  const chapter = readFileSync(INSPECTION, "utf8");
  const found = chapter.split(/^## /mu).find((part) => part.startsWith(heading));
  expect(found, `inspection.md has no "${heading}" section`).toBeDefined();
  return found ?? "";
}

/** The backticked token in the first cell of every table row of a section. */
function tableCodes(text: string): string[] {
  return [...text.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gmu)].map((match) => String(match[1]));
}

/** Every backticked lowercase word in a section. A cause may be one word, so
 *  this is not the hyphenated form; the section's other backticked spans are
 *  glob shapes (`*-busy`) that cannot match. */
function causeTokens(text: string): string[] {
  return [...text.matchAll(/`([a-z][a-z0-9-]*)`/gu)].map((match) => String(match[1]));
}

const envelope = section("The JSON error envelope");

test("the envelope shape the chapter shows is the shape the runtime writes", () => {
  for (const field of ["schemaVersion", "kind", "error", "code", "operation", "cause", "message", "retryable", "details"]) {
    expect(envelope, `envelope field ${field}`).toContain(`"${field}"`);
  }
  expect(envelope).toContain('"kind": "error"');
});

test("U1: spine.ts holds exactly the error codes inspection.md defines", () => {
  const documented = [...new Set(tableCodes(envelope.split("### Causes")[0] ?? ""))].sort(bytewise);
  expect(documented.length, "the Codes table read as empty").toBeGreaterThan(4);
  expect([...ERROR_CODES].sort(bytewise)).toEqual(documented);
  expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
});

test("U1: spine.ts holds exactly the error causes inspection.md defines", () => {
  const causes = envelope.split("### Causes")[1] ?? "";
  const documented = [...new Set(causeTokens(causes))].sort(bytewise);
  // The run's own cause words reach the envelope before a run is born, and the
  // chapter names them in that sentence rather than in the list.
  const spelled = [...new Set([...ERROR_CAUSES, ...CAUSES])].sort(bytewise);
  expect(documented.length, "the Causes section read as empty").toBeGreaterThan(50);
  expect(spelled).toEqual(documented);
  expect(new Set(ERROR_CAUSES).size).toBe(ERROR_CAUSES.length);
});

test("every declared cause carries a code, and every code carries a cause", () => {
  // Both halves are values, so a vocabulary emptied by a bad edit cannot pass
  // either comparison above vacuously.
  expect(ERROR_CODES.length).toBeGreaterThan(0);
  expect(ERROR_CAUSES.length).toBeGreaterThan(ERROR_CODES.length);
  for (const word of CAUSES) expect(ERROR_CAUSES).toContain(word);
});
