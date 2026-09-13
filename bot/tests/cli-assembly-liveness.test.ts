// Ticket 0063 item 1 — `bot assembly update` and `bot assembly remove` refuse
// while a run of that assembly is live. The assertion source is
// specification/elements/management.md, "While a run of it is going":
// - "An assembly a run is still using is not swapped or taken away underneath
//   it. Named on such an assembly, `update` and `remove` refuse and say to
//   wait; a run that died holds nothing, and neither does one that ended."
// - "`remove` refuses for a linked assembly as well as an installed one ...
//   `update` has nothing to guard there, because updating a link was never
//   more than a no-op."
// - "`update` with no name is a report rather than a demand ... the one in use
//   gets a line saying so, and the walk goes on. Refusing partway would be
//   worse than saying nothing — the assemblies earlier in name order would
//   already have been replaced, and their lines would go unsaid."
//
// The three-way witness this file exists for: a LIVE run refuses both verbs, a
// CRASHED run refuses neither, and a live run of one assembly says nothing
// about another. Ticket 0031 named the mid-run-swap hazard and left it; 0033
// built the running-vs-crashed reading that closes it.
//
// No timing anywhere: the lock state is written outright, never waited for.
import { lstatSync } from "node:fs";
import { mkdir, readFile, realpath, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lockSync } from "proper-lockfile";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, cleanup, holdLock, lines, scratch, text, tree, type Capture } from "./assembly-home.ts";
import { currentRecord } from "./current-record.ts";
import { main } from "../src/cli.ts";

afterEach(cleanup);

/**
 * A run of `assembly` that never ended, holding a live lock or a stale one.
 * The lock state is set outright rather than waited for: a fresh `lockSync`
 * reads live, and a lock directory dated ten minutes back reads stale, which
 * is how `bot runs` tells `running` from `crashed` (inspection.md). No sleep.
 */
async function unfinished(home: string, run: string, assembly: string, live: boolean): Promise<void> {
  const directory = join(home, "runs", run);
  await mkdir(directory, { recursive: true });
  // `record: 1` first, as every record has since the writer existed: the first
  // line names the format version (record.md, invariant 48), and since ticket
  // 0079 the reader reads it, so a fixture without it is not a record at all.
  const start = { record: 1, event: "run_start", ts: "2026-08-02T11:00:00.000Z", run, assembly, flow: "main" };
  await writeFile(join(directory, "record.jsonl"), currentRecord([start]));
  if (live) {
    holdLock(lockSync(directory, { realpath: false }));
    return;
  }
  const past = new Date(Date.now() - 600_000);
  await mkdir(`${directory}.lock`);
  await utimes(`${directory}.lock`, past, past);
}

test("update and remove refuse while a run of that assembly is live; another assembly is untouched", async () => {
  const held = await scratch("bot-assembly-live-");
  // Name order matters here and is deliberate: the LIVE assembly sorts LAST,
  // so the batch walk reaches `a-first` and fetches it before it ever sees
  // `z-live`. That is the arrangement in which a refusal partway would be
  // discarding a report of work already done on disk.
  const first = await tree(join(held.root, "code", "a-first"), "First.");
  const liveSource = await tree(join(held.root, "code", "z-live"), "Live.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  await lines(["assembly", "install", first], boundary, capture, 0);
  await lines(["assembly", "install", liveSource], boundary, capture, 0);
  await unfinished(held.home, "2026-08-02T11-00-00-aaaa", "z-live", true);

  // Both installed copies are marked, because a re-fetch is otherwise
  // invisible: the sources say the same words the copies do. These bytes are
  // the only thing that distinguishes "was fetched" from "was left alone".
  const mark = async (name: string): Promise<string> => {
    const path = join(held.home, "assemblies", name, "ASSEMBLY.md");
    await writeFile(path, `---\nintelligence: default\n---\nMarked copy of ${name}.\n`);
    return path;
  };
  const firstCopy = await mark("a-first");
  const liveCopy = await mark("z-live");

  // Named, it is a fault: exit 2, the sentence, and nothing written to stdout.
  await expect(main(["assembly", "update", "z-live"], boundary)).resolves.toBe(2);
  expect(text(capture.err))
    .toBe("assembly-in-use  z-live\n  Wait for the run of that assembly to end; update never swaps a tree in use.\n");
  capture.err.length = 0;

  await expect(main(["assembly", "remove", "z-live"], boundary)).resolves.toBe(2);
  expect(text(capture.err))
    .toBe("assembly-in-use  z-live\n  Wait for the run of that assembly to end; remove never takes a tree in use.\n");
  capture.err.length = 0;
  expect(text(capture.out)).toBe("");

  // Nothing moved: the refusal comes before the fetch and before the removal.
  await expect(readFile(liveCopy, "utf8")).resolves.toContain("Marked copy of z-live.");

  // With no name it is a report, not a demand. Both lines are said: `a-first`
  // was really fetched, and `z-live` is named as skipped rather than going
  // silently missing. A refusal here would exit 2 having ALREADY replaced
  // a-first, and would throw a-first's line away — work done and not told.
  expect(await lines(["assembly", "update"], boundary, capture, 0)).toEqual([
    `a-first  installed  updated from ${await realpath(first)}`,
    "z-live  installed  in use by a live run, not updated",
  ]);
  expect(text(capture.err)).toBe("");
  // The two halves of that claim, on disk: one tree replaced, one left alone.
  await expect(readFile(firstCopy, "utf8")).resolves.toContain("First.");
  await expect(readFile(liveCopy, "utf8")).resolves.toContain("Marked copy of z-live.");

  // The guard is per assembly, not per home — the other one still goes.
  expect(await lines(["assembly", "remove", "a-first"], boundary, capture, 0)).toEqual(["a-first  removed"]);
});

// Ticket 0071. The guard above is keyed on the assembly's own name, so it is
// only a guard if the removal TARGET is that same name. While the removal
// target was any path under `assemblies/`, naming the parent directory walked
// straight around it and took the live run's tree — the guard refusing on the
// exact name in the same breath. A guard a caller steps around by spelling the
// name differently is not a guard.
//
// The lock is taken and both refusals asserted in ONE process: proper-lockfile
// calls a lock stale after ten seconds, so a lock held across shell commands
// would read as a crashed run and prove nothing.
test("the liveness guard is not walked around by naming the namespace above the live assembly", async () => {
  const held = await scratch("bot-assembly-live-namespace-");
  const source = await tree(join(held.root, "code", "triage"), "Triage.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  await lines(["assembly", "install", source, "--name", "team/triage"], boundary, capture, 0);
  await unfinished(held.home, "2026-08-02T11-00-00-dddd", "team/triage", true);

  await expect(main(["assembly", "remove", "team/triage"], boundary)).resolves.toBe(2);
  expect(text(capture.err))
    .toBe("assembly-in-use  team/triage\n  Wait for the run of that assembly to end; remove never takes a tree in use.\n");
  capture.err.length = 0;

  // The same tree, named through its parent: still refused, and still there.
  await expect(main(["assembly", "remove", "team"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe("assembly-unknown  team\n  Name an assembly the home holds.\n");
  expect(text(capture.out)).toBe("");
  await expect(readFile(join(held.home, "assemblies", "team", "triage", "ASSEMBLY.md"), "utf8")).resolves.toContain("Triage.");
});

test("a crashed run holds nothing: the same assembly updates and removes once its lock is stale", async () => {
  const held = await scratch("bot-assembly-crashed-");
  const review = await tree(join(held.root, "code", "review"), "Review.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  await lines(["assembly", "install", review], boundary, capture, 0);
  await unfinished(held.home, "2026-08-02T11-00-00-bbbb", "review", false);

  // The same reading both sides use: a stale lock and no run_end is `crashed`.
  expect((await lines(["run", "list"], boundary, capture, 0)).join("\n"))
    .toContain("| 2026-08-02T11-00-00-bbbb | review | main |");
  expect(await lines(["assembly", "update", "review"], boundary, capture, 0))
    .toEqual([`review  installed  updated from ${await realpath(review)}`]);
  expect(await lines(["assembly", "remove", "review"], boundary, capture, 0)).toEqual(["review  removed"]);
  expect(text(capture.err)).toBe("");
});

test("a live run of a linked assembly holds the link too: remove refuses rather than breaking the run", async () => {
  const held = await scratch("bot-assembly-live-link-");
  const live = await tree(join(held.root, "code", "dev-bot"), "Dev.");
  await symlink(live, join(held.home, "assemblies", "dev-bot"));
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  await unfinished(held.home, "2026-08-02T11-00-00-cccc", "dev-bot", true);

  // The run reads its own copy and not the link (ADR 0016), so nothing in
  // flight would break — the guard is the home's account of a going run, and
  // 0119 replaced the dead reason in management.md without touching it here.
  await expect(main(["assembly", "remove", "dev-bot"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toContain("Wait for the run of that assembly to end");
  expect(lstatSync(join(held.home, "assemblies", "dev-bot")).isSymbolicLink()).toBe(true);
  capture.err.length = 0;

  // `update` guards nothing here and says so: a link has no tree to swap, so
  // the truthful no-op stands rather than a false alarm about a live run.
  expect(await lines(["assembly", "update", "dev-bot"], boundary, capture, 0))
    .toEqual(["dev-bot  linked  already live"]);
  expect(text(capture.err)).toBe("");
});
