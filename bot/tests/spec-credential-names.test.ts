// Ticket 0282, unspecified behavior U6. slots.md's "What is scrubbed" names
// every provider credential environment variable this runtime removes before
// a child sees it. The list is a promise to an operator who reads only the
// specification, so it is pinned to CREDENTIAL_ENVIRONMENT_NAMES in both
// directions the way spec-error-vocabulary.test.ts pins the error codes.
// A name the runtime scrubs that the chapter omits is red, and a name the
// chapter claims that the runtime does not recognize is red.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { CREDENTIAL_ENVIRONMENT_NAMES } from "../src/credential-environment.ts";
import { bytewise } from "../src/model.ts";

const SLOTS = new URL("../../specification/elements/slots.md", import.meta.url).pathname;

/** The names inside the fenced block of slots.md's "What is scrubbed". */
function specifiedNames(): string[] {
  const chapter = readFileSync(SLOTS, "utf8");
  const section = chapter.split(/^## /mu).find((part) => part.startsWith("What is scrubbed"));
  expect(section, "slots.md has no \"What is scrubbed\" section").toBeDefined();
  const fence = /```\n([\s\S]*?)```/u.exec(section ?? "");
  expect(fence, "\"What is scrubbed\" has no fenced name list").not.toBeNull();
  return (fence?.[1] ?? "").split(/\s+/u).filter((name) => name.length > 0);
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
