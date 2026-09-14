// Ticket 0282, unspecified behavior U6. slots.md's "What is scrubbed" names
// every provider credential environment variable this runtime removes before
// a child sees it. The list is a promise to an operator who reads only the
// specification, so it is pinned to CREDENTIAL_ENVIRONMENT_NAMES in both
// directions the way spec-error-vocabulary.test.ts pins the error codes.
// A name the runtime scrubs that the chapter omits is red, and a name the
// chapter claims that the runtime does not recognize is red.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { CREDENTIAL_ENVIRONMENT_NAMES, NON_SECRET_CREDENTIAL_ENVIRONMENT_NAMES } from "../src/credential-environment.ts";
import { bytewise } from "../src/model.ts";

const SLOTS = new URL("../../specification/elements/slots.md", import.meta.url).pathname;

/** The names inside one fenced block of slots.md's "What is scrubbed": the
 *  first holds every scrubbed name, the second the ones whose value is not a
 *  secret and is therefore left as written in a provider's report (0286). */
function fencedNames(which: number): string[] {
  const chapter = readFileSync(SLOTS, "utf8");
  const section = chapter.split(/^## /mu).find((part) => part.startsWith("What is scrubbed"));
  expect(section, "slots.md has no \"What is scrubbed\" section").toBeDefined();
  const fences = [...(section ?? "").matchAll(/```\n([\s\S]*?)```/gu)];
  expect(fences.length, "\"What is scrubbed\" is missing a fenced name list").toBeGreaterThan(which);
  return (fences[which]?.[1] ?? "").split(/\s+/u).filter((name) => name.length > 0);
}

function specifiedNames(): string[] {
  return fencedNames(0);
}

test("the chapter names every credential environment variable the runtime scrubs", () => {
  const specified = specifiedNames();
  expect([...CREDENTIAL_ENVIRONMENT_NAMES].filter((name) => !specified.includes(name)))
    .toEqual([]);
});

test("the chapter claims no credential environment variable the runtime ignores", () => {
  const declared = CREDENTIAL_ENVIRONMENT_NAMES;
  expect(specifiedNames().filter((name) => !declared.has(name))).toEqual([]);
});

test("the fenced list is sorted and holds no duplicate", () => {
  const specified = specifiedNames();
  expect(specified.length).toBeGreaterThan(40);
  expect(new Set(specified).size).toBe(specified.length);
  expect(specified).toEqual([...specified].sort(bytewise));
});

// Ticket 0286. The second fenced list is the promise that these names are
// scrubbed from a child like every other, and that a provider's report keeps
// their values as the provider wrote them. It is pinned in both directions.
test("the chapter names every non-secret credential environment variable and no other", () => {
  const specified = fencedNames(1);
  expect([...NON_SECRET_CREDENTIAL_ENVIRONMENT_NAMES].filter((name) => !specified.includes(name))).toEqual([]);
  expect(specified.filter((name) => !NON_SECRET_CREDENTIAL_ENVIRONMENT_NAMES.has(name))).toEqual([]);
});

test("the non-secret fenced list is sorted, holds no duplicate, and sits inside the scrubbed list", () => {
  const specified = fencedNames(1);
  expect(new Set(specified).size).toBe(specified.length);
  expect(specified).toEqual([...specified].sort(bytewise));
  expect(specified.filter((name) => !CREDENTIAL_ENVIRONMENT_NAMES.has(name))).toEqual([]);
});
