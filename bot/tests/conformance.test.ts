// The conformance harness: every case under specification/conformance/ runs
// against the reader, and the checked-in ledger (conformance-passing.txt)
// ratchets progress — a ledger case failing is a regression, a passing case
// missing from the ledger is uncommitted progress, and a discovered case that
// is not in the ledger at all is unaccounted for. All three are red. The last
// is what makes "conformance N/N" mean "every case passes" rather than merely
// "N cases pass": without it a case that fails and is unledgered regresses
// nothing and commits nothing, so it slips through both other rules.
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { check } from "../src/reader.ts";
import { REFUSAL_CODES } from "../src/spine.ts";

const CORPUS = new URL("../../specification/conformance", import.meta.url)
  .pathname;
const LEDGER = new URL("conformance-passing.txt", import.meta.url).pathname;
const REFUSALS = new URL("../../specification/elements/refusals.md", import.meta.url).pathname;
const TESTS = new URL(".", import.meta.url).pathname;

interface Case {
  name: string;
  kind: "refuse" | "accept";
  dir: string;
}

function cases(): Case[] {
  const out: Case[] = [];
  for (const kind of ["refuse", "accept"] as const) {
    for (const name of readdirSync(join(CORPUS, kind)).sort()) {
      out.push({ name: `${kind}/${name}`, kind, dir: join(CORPUS, kind, name) });
    }
  }
  return out;
}

/** Parse JSONL into objects; a refuse expectation is a `{code, path}` set. */
function parseLines(text: string): Record<string, unknown>[] {
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function faultSet(objects: Record<string, unknown>[]): Set<string> {
  return new Set(
    objects.map((o) => `${String(o["code"])} ${String(o["path"])}`),
  );
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

/** Whether one case passes: refuse asserts the {code, path} set and exit 2; accept asserts byte-exact lines and exit 0. */
function caseResult(c: Case, environment: NodeJS.ProcessEnv = process.env) {
  const invocation = readFileSync(join(c.dir, "invocation"), "utf8").trim();
  return check(invocation, c.dir, { ...environment, BOT_HOME: join(c.dir, "home") });
}

function passes(c: Case): boolean {
  const expected = readFileSync(join(c.dir, "expected.jsonl"), "utf8");
  let result;
  try {
    result = caseResult(c);
  } catch {
    return false;
  }
  if (c.kind === "refuse") {
    return (
      result.exitCode === 2 &&
      setsEqual(faultSet(parseLines(expected)), faultSet(parseLines(result.lines.join("\n"))))
    );
  }
  return result.exitCode === 0 && result.lines.join("\n") + "\n" === expected;
}

const all = cases();

test("a conformance case ignores hostile ambient homes", () => {
  const example = all.find(({ name }) => name === "accept/shape-minimal");
  expect(example).toBeDefined();
  if (example === undefined) return;
  const root = mkdtempSync(join(tmpdir(), "bot-conformance-home-"));
  try {
    const hostile = join(root, "hostile");
    mkdirSync(hostile);
    writeFileSync(
      join(hostile, "config.yaml"),
      "intelligences:\n  default: { provider: hostile, model: hostile-model, reasoning: low }\n",
    );
    const clean = caseResult(example, {
      ...process.env,
      HOME: join(root, "clean-home"),
      XDG_CONFIG_HOME: join(root, "clean-config"),
      BOT_HOME: join(example.dir, "home"),
    });
    const changed = caseResult(example, {
      ...process.env,
      HOME: join(root, "other-home"),
      XDG_CONFIG_HOME: join(root, "other-config"),
      BOT_HOME: hostile,
    });
    expect(changed).toEqual(clean);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conformance scoreboard and ledger", () => {
  const passing = all.filter(passes).map((c) => c.name);
  const ledger = readFileSync(LEDGER, "utf8")
    .split("\n")
    .filter((line) => line.length > 0);
  const duplicateLedgerEntries = ledger.filter(
    (name, index) => ledger.indexOf(name) !== index,
  );
  expect(
    duplicateLedgerEntries,
    "duplicate cases in tests/conformance-passing.txt",
  ).toEqual([]);

  // process.stdout.write, not console.log: vitest hides passing tests' console
  // output in run mode, and the scoreboard must always be visible.
  process.stdout.write(
    `conformance: ${String(passing.length)}/${String(all.length)} passing\n`,
  );

  const regressions = ledger.filter((name) => !passing.includes(name));
  expect(regressions, "ledger cases no longer passing").toEqual([]);

  const unledgered = passing.filter((name) => !ledger.includes(name));
  expect(
    unledgered,
    "cases passing but absent from tests/conformance-passing.txt — add them",
  ).toEqual([]);

  const unaccounted = all
    .map((c) => c.name)
    .filter((name) => !ledger.includes(name));
  expect(
    unaccounted,
    "cases in the corpus but absent from tests/conformance-passing.txt — every discovered case must be ledgered and passing",
  ).toEqual([]);
});

/** The codes refusals.md's "Managing the home" table defines — `bot assembly`'s
 *  own, the ones no case can hold. Read from the chapter, so the exemption is
 *  the specification's and not this file's. */
function managementCodes(): string[] {
  const chapter = readFileSync(REFUSALS, "utf8");
  const section = chapter.split(/^## /mu).find((part) => part.startsWith("Managing the home")) ?? "";
  return [...section.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gmu)].map((match) => String(match[1]));
}

/** Whether some test in this suite asserts a whole stderr byte for byte —
 *  `.toBe("<code>  <path>\n  <sentence>\n")` — for this code. */
function pinnedByTest(code: string, suite: string): boolean {
  return new RegExp(`\\.toBe\\(\\s*"${code} {2}[^"]+\\\\n {2}[^"]+\\\\n"`, "u").test(suite);
}

// REDESIGN, ticket 0125, under Ian's ruling of 2026-08-05 that invariant 50 is
// scoped to the refusals a runtime gives for an assembly it READ. Before it,
// this asserted every code in spine.ts is exercised by a corpus case; `bot
// assembly` refuses things no checked-in directory can be — a live run, an
// absent program — so that assertion could only have been kept by never naming
// those faults. The loop still closes, in two halves: a reader's code is a
// corpus case, and a home's code is named as one in refusals.md AND pinned
// somewhere in this suite by an assertion on the whole stderr, code included.
// Exempting without checking the pin would leave the codes with no witness at
// all, which is the hole the exemption was meant not to open.
test("refusal codes: the reader's are corpus cases, the home's are pinned by test", () => {
  const corpus = new Set<string>();
  for (const c of all) {
    const text = readFileSync(join(c.dir, "expected.jsonl"), "utf8");
    for (const o of parseLines(text)) {
      if (typeof o["code"] === "string") corpus.add(o["code"]);
    }
  }
  const table = new Set<string>(REFUSAL_CODES);
  const management = managementCodes();
  // The extraction is load-bearing — read empty it checks no pin at all — so it
  // is measured before it is used, and says so rather than blaming the table.
  expect(management.length, "refusals.md's 'Managing the home' table read as empty").toBeGreaterThan(0);
  expect(
    [...corpus].filter((code) => !table.has(code)),
    "corpus codes missing from spine.ts",
  ).toEqual([]);
  const runtimeOnly = ["model-unresolved"];
  expect(
    [...table].filter((code) => !corpus.has(code)).sort(),
    "spine.ts codes no corpus case exercises — only home-management and runtime-only codes may stand here",
  ).toEqual([...management, ...runtimeOnly].sort());

  const suite = readdirSync(TESTS)
    .filter((name) => name.endsWith(".test.ts"))
    .map((name) => readFileSync(join(TESTS, name), "utf8"))
    .join("\n");
  expect(
    management.filter((code) => !pinnedByTest(code, suite)),
    "management codes with no test asserting their stderr byte for byte",
  ).toEqual([]);
  expect(runtimeOnly.filter((code) => !suite.includes(`toContain(\"${code}\")`)),
    "runtime-only codes with no runtime assertion").toEqual([]);
});
