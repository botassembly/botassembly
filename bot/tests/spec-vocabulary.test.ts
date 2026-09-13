// Ticket 0061 — the two closed vocabularies and the one comparator, pinned to
// the specification's own text rather than to a transcription of it.
//
// Why this file exists: `spine.ts` says of itself that it holds "every refusal
// code in specification/elements/refusals.md" and the cause words of
// specification/elements/record.md. Nothing checked that. conformance.test.ts
// closes the loop spine.ts <-> corpus, so a code the SPEC defines and the
// runtime never learned was invisible to the gate in both directions:
// invariant 50 ("Every refusal this specification defines is a case in the
// corpus. A rule with no case is not yet a rule") had no witness on its
// specification-facing leg, and invariant 45 ("Every way a run or a stage can
// end has exactly one cause word, and no two meanings share a word") had no
// witness on the closed-vocabulary half at all.
//
// The two halves together are the whole claim:
//   refusals.md -> REFUSAL_CODES   (here)
//   REFUSAL_CODES -> the corpus    (conformance.test.ts)
//
// Invariant 41's last clause — "the sort is bytewise over UTF-8: one
// comparator, no locale" — is pinned here too, because `bytewise` is that one
// comparator and nothing else named the difference. Every ordering fixture in
// the suite uses names on which bytewise and a locale collation agree, so the
// comparator could be swapped for `localeCompare` with the gate still green.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { bytewise } from "../src/model.ts";
import { CAUSES, REFUSAL_CODES } from "../src/spine.ts";

const ELEMENTS = new URL("../../specification/elements/", import.meta.url).pathname;
const SPECIFICATION = new URL("../../specification/", import.meta.url).pathname;
const RETIRED_MODEL_CHOICE_KEYS = ["provider", "model", "reasoning", "profile", "tier", "variant"] as const;

function markdownFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith(".md") ? [path] : [];
  });
}

function retiredPathNames(root: string): string[] {
  const refusalCases = join(SPECIFICATION, "conformance/refuse");
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    const nested = entry.isDirectory() ? retiredPathNames(path) : [];
    const namesRetiredVocabulary = /\b(?:profile|tier)\b/iu.test(entry.name.replaceAll("-", " "));
    const allowedCaseName = entry.isDirectory() && root === refusalCases;
    return [...(namesRetiredVocabulary && !allowedCaseName ? [path.slice(SPECIFICATION.length)] : []), ...nested];
  });
}

function retiredAuthoredKeyLines(text: string): number[] {
  const key = "(?:provider|model|reasoning|profile|tier|variant)";
  const authoredKey = new RegExp(`(?:^\\s*${key}\\s*:|^\\|\\s*` + key + "`\\s*\\||`" + key + "`)", "iu");
  return text.split("\n").flatMap((line, index) => authoredKey.test(line) ? [index + 1] : []);
}

/**
 * The backticked token in the first cell of every table row, which is how both
 * chapters spell a vocabulary word. Header and separator rows have no code span
 * in their first cell, and prose outside a table is not a row, so a code named
 * in a sentence (refusals.md's `not-runnable` beside `entry-unknown`) is not
 * collected twice.
 */
function tableCodes(file: string): string[] {
  const text = readFileSync(new URL(file, `file://${ELEMENTS}`), "utf8");
  const codes: string[] = [];
  for (const line of text.split("\n")) {
    const match = /^\|\s*`([a-z0-9-]+)`\s*\|/u.exec(line);
    if (match?.[1] !== undefined) codes.push(match[1]);
  }
  return codes;
}

test("invariant 50: spine.ts holds exactly the refusal codes refusals.md defines", () => {
  const spec = [...new Set(tableCodes("refusals.md"))].sort(bytewise);
  // A guard on the extraction itself: refusals.md's six tables carry many
  // codes, so an empty or tiny read would pass the comparison vacuously.
  expect(spec.length).toBeGreaterThan(30);
  expect([...REFUSAL_CODES].sort(bytewise)).toEqual(spec);
  // "Two faults with the same fix share a code" (invariant 39): the runtime's
  // list is a set, so a code split in two would show up here as well as in the
  // corpus cases that share one.
  expect(new Set(REFUSAL_CODES).size).toBe(REFUSAL_CODES.length);
});

test("invariant 45: CAUSES holds exactly the cause words record.md's table names, each once", () => {
  // record.md's cause table spends `timeout` on two rows — one exit code each
  // — which is the chapter saying the word is one word with one meaning
  // ("an agent out of time is the work failing, a gate out of time is the run
  // being impossible"). The vocabulary is the SET of those first cells.
  const rows = tableCodes("record.md");
  const spec = [...new Set(rows)].sort(bytewise);
  expect(rows.length).toBeGreaterThan(spec.length); // the two `timeout` rows
  expect([...CAUSES].sort(bytewise)).toEqual(spec);
  expect(new Set(CAUSES).size).toBe(CAUSES.length);
});

test("the retired profile and tier vocabulary has only the three contract carve-outs", () => {
  const proseSurvivors = new Set([`${SPECIFICATION}CHANGELOG.md`, `${ELEMENTS}refusals.md`]);
  const findings = markdownFiles(SPECIFICATION).flatMap((file) => {
    if (proseSurvivors.has(file)) return [];
    return readFileSync(file, "utf8").split("\n").flatMap((line, index) =>
      /\b(?:profile|profiles|tier|tiers)\b/iu.test(line)
        ? [`${file.slice(SPECIFICATION.length)}:${String(index + 1)}`]
        : []);
  });
  expect(findings, "profile/tier prose outside the changelog and migration refusals").toEqual([]);
  expect(retiredPathNames(SPECIFICATION), "profile/tier path names outside refusal cases").toEqual([]);

  const caseNames = readdirSync(join(SPECIFICATION, "conformance/refuse"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /\b(?:profile|tier)\b/iu.test(entry.name.replaceAll("-", " ")))
    .map((entry) => entry.name);
  expect(caseNames.length, "the retained refusal case-name carve-out").toBeGreaterThan(0);
});

test("authored model choice in the specification uses only intelligence", () => {
  for (const key of RETIRED_MODEL_CHOICE_KEYS) {
    expect(retiredAuthoredKeyLines(`${key}: retired`), `seeded ${key} key`).toEqual([1]);
  }

  const authoredOptionDocs = [
    `${ELEMENTS}assembly.md`,
    `${ELEMENTS}stage.md`,
    `${ELEMENTS}flow.md`,
    `${SPECIFICATION}example.md`,
  ];
  const findings = authoredOptionDocs.flatMap((file) => retiredAuthoredKeyLines(readFileSync(file, "utf8"))
    .map((line) => `${file.slice(SPECIFICATION.length)}:${String(line)}`));
  const variantDocs = [...markdownFiles(ELEMENTS), `${SPECIFICATION}example.md`, `${SPECIFICATION}conformance.md`]
    .filter((file) => file !== `${ELEMENTS}refusals.md`);
  findings.push(...variantDocs.flatMap((file) => readFileSync(file, "utf8").split("\n").flatMap((line, index) =>
    /\bvariants?\b/iu.test(line) ? [`${file.slice(SPECIFICATION.length)}:${String(index + 1)}`] : [])));

  expect([...new Set(findings)], "retired authored model-choice vocabulary in normative prose").toEqual([]);
});

test("invariant 41: the one comparator is bytewise over UTF-8, never a locale collation", () => {
  // The discriminating pairs. A locale collation folds case and ignores
  // punctuation; bytewise does neither, and the spec asks for bytewise.
  expect(bytewise("B", "a")).toBeLessThan(0); // 0x42 before 0x61
  expect("B".localeCompare("a")).toBeGreaterThan(0); // the collation disagrees
  expect(bytewise("Z", "a")).toBeLessThan(0);
  expect(bytewise("_x", "ax")).toBeLessThan(0); // 0x5f before 0x61
  expect(bytewise("a", "A")).toBeGreaterThan(0);
  // Beyond ASCII the unit is the UTF-8 byte, not the UTF-16 code unit: U+FF21
  // encodes as ef bc a1, so it sorts after every astral character, whose
  // leading byte is f0 — the opposite of a code-unit comparison, where a
  // surrogate pair (d800..dbff) sorts first.
  const codeUnitOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  expect(bytewise("\u{10000}", "Ａ")).toBeGreaterThan(0);
  expect(codeUnitOrder("\u{10000}", "Ａ")).toBeLessThan(0); // the code-unit order disagrees
});
