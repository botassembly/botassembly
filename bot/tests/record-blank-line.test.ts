// Ticket 0112 part 2 — a blank line inside a record was silently eaten.
//
// `record-lines.ts` skipped EVERY empty element of `source.split("\n")`, not
// only the final one a terminating newline produces. So a record with a blank
// line between two events read as a healthy run, and `bot show --json` — whose
// own help says it hands back "the record's own JSONL lines" — handed back a
// file that was one line shorter than the one on disk and said nothing. The
// driver measured it: 208 bytes in, 207 bytes out, exit 0, empty stderr.
// `specification/elements/invariants.md:47` says one JSON object per line, and
// a blank line is not one.
//
// The rule now: only the LAST split element may be empty, because that element
// is the line terminator rather than a line. An interior blank is a line that
// will not parse, which has been `bad-record` since 0080.
//
// THE CASES THAT MUST NOT MOVE, and where each is already pinned — none is
// restated here, because restating an assertion is how two copies of it start
// disagreeing:
//   - An EMPTY record file is a run with no events, not a bad record.
//     `inspection-record-shapes.test.ts:370` writes zero bytes and asserts
//     exit 0, empty stderr, and the row `<run>  -  -  -  crashed  -`;
//     `inspection-record-dialect.test.ts:136` writes zero bytes and asserts the
//     same row plus empty stderr, for the dialect reader. Zero bytes split to
//     ONE element which IS the final one, so both stay green untouched.
//   - A TORN final line still reads as a run, not a bad record — the 0080 rule.
//     `inspection-record-shapes.test.ts:289`, `inspection-record-contract.ts:140`
//     and `inspection-corrupt-run.test.ts:283` each cut a record mid-append and
//     assert the run still lists, with `--json` handing back the whole lines
//     only. A torn line is never empty, so the new rule cannot reach it.
//   - A NORMAL trailing newline is what every healthy fixture in the suite
//     already has, and `cli-exit.test.ts:53` asserts `--json` returns the file's
//     bytes exactly, for a 4001-line record.
// What was NOT pinned anywhere is a complete final line with no terminator at
// all, so that one is witnessed below rather than cited.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { currentRecord } from "./current-record.ts";
import { invokeCli } from "./invoke.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const HEALTHY = "2026-08-05T10-00-00-1111";
const BLANK = "2026-08-05T11-00-00-2222";
const HASH = "a".repeat(64);

const START = (run: string): string => currentRecord([{
  record: 1, ts: run === HEALTHY ? "2026-08-05T10:00:00.000Z" : "2026-08-05T11:00:00.000Z",
  event: "run_start", run, assembly: "review", assemblyHash: HASH, flow: "main",
}]).trimEnd();
const hour = (run: string): string => run === HEALTHY ? "10" : "11";
const body = (run: string): string => currentRecord([
  { ts: `2026-08-05T${hour(run)}:00:01.000Z`, event: "stage_start", stage: "01-work", retry: 1 },
  { ts: `2026-08-05T${hour(run)}:00:04.000Z`, event: "stage_end", stage: "01-work", retry: 1, exit: 0, cause: "success" },
]).trimEnd();
const end = (run: string): string => `{"ts":"2026-08-05T${hour(run)}:00:05.000Z","event":"run_end","exit":0,"cause":"success"}`;
const story = (run: string): string => `${START(run)}\n${body(run)}\n${end(run)}`;
const storyLines = story(BLANK).split("\n").length;

/** A home holding one healthy run, plus one run whose record is the caller's
 *  bytes. The healthy run is the falsification: a reader that refused the whole
 *  home, or stopped listing, reddens on it. */
async function homeWith(bytes: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-blank-line-"));
  roots.push(root);
  const home = join(root, "home");
  await mkdir(join(home, "runs", HEALTHY), { recursive: true });
  await mkdir(join(home, "runs", BLANK), { recursive: true });
  await writeFile(join(home, "runs", HEALTHY, "record.jsonl"), `${story(HEALTHY)}\n`);
  await writeFile(join(home, "runs", BLANK, "record.jsonl"), bytes);
  return home;
}

// WITNESS 1 — the driver's reproduction, through the CLI. RED against main,
// where this record reads as a healthy `0/success` run and `--json` quietly
// republishes it a line short.
test("a blank line between two events makes the record invalid, not a shorter file", async () => {
  const home = await homeWith(`${START(BLANK)}\n\n${body(BLANK)}\n${end(BLANK)}\n`);
  const listed = await invokeCli(["run", "list"], { home });
  expect(listed.code).toBe(0);
  expect(listed.out).toContain(`| ${HEALTHY} | review | main |`);
  expect(listed.out).toContain(`| ${BLANK} | - | - |`);
  // The mark cannot say WHICH line, so the sentence does (refusals.md).
  expect(listed.err).toContain("Invalid record line 2");
  expect(listed.err).toContain(BLANK);

  // The forensic JSON path retains every complete object line. It still exits
  // nonzero and diagnoses the invalid interior framing.
  const shown = await invokeCli(["run", "events", BLANK, "--json"], { home });
  expect(shown.code).toBe(5);
  expect(shown.out).toBe("");
  expect(shown.err).toContain("Invalid record line 2");
});

// The same rule at the two other places a blank can sit, so the fix is "only
// the terminator" and not "only a blank in the middle": a record that BEGINS
// with a blank line, and one that ends with a blank line before its terminator
// — which is the shape a naive `join("\n")` over an empty event list produces.
test("a leading blank line and a trailing blank line are both invalid", async () => {
  for (const [bytes, line] of [
    [`\n${story(BLANK)}\n`, "1"],
    [`${story(BLANK)}\n\n`, String(storyLines + 1)],
  ] as const) {
    const home = await homeWith(bytes);
    const listed = await invokeCli(["run", "list"], { home });
    expect(listed.out).toContain(`| ${BLANK} | - | - |`);
    expect(listed.err).toContain(`Invalid record line ${line}`);
  }
});

// The edge the new rule is defined against, and the one nothing else pinned: a
// record whose last line is COMPLETE but unterminated. There is no final empty
// element to ignore, every element is a line, and the run reads.
test("a complete-looking unterminated ending is omitted as a torn segment", async () => {
  const home = await homeWith(story(BLANK));
  const listed = await invokeCli(["run", "list"], { home });
  expect(listed.code).toBe(0);
  expect(listed.err).toMatch(/unterminated torn segment/u);
  expect(listed.out).toContain(`| ${HEALTHY} | review | main |`);
  expect(listed.out).toContain(`| ${BLANK} | review | main |`);
  // `--json` hands back both lines, each terminated — JSONL as it is written,
  // not the file's own bytes. A record whose last line was never terminated is
  // the one case where the two differ, and the line itself is unchanged.
  const shown = await invokeCli(["run", "events", BLANK, "--json"], { home });
  expect(shown.code).toBe(0);
  expect(shown.code).toBe(0);
  expect(shown.err).toBe("");
  expect((JSON.parse(shown.out) as { data: { events: unknown[] } }).data.events).toHaveLength(5);
});
