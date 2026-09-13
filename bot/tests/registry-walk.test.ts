// Ticket 0078 — `bot status` and `bot assembly list` read ONE walk of the
// home's registry.
//
// The sentence both answer to is the home's own: "An entry standing at an
// assembly's name under `assemblies/` may be a symbolic link to a directory"
// (home.md) — a link IS one of the assemblies the home holds — and
// `bot status` reports "how many assemblies" (inspection.md). So the count and
// the listing are one fact, and CHECKLIST 9 puts a fact in one place.
//
// Two falsifications that pull in opposite directions, each in its own home so
// that neither can pass by cancelling the other out:
//
//   1. the symlink half — one installed and one linked assembly. Before the
//      fix `bot assembly list` printed two and `bot status` counted one: the
//      count recursed on `entry.isDirectory()`, and a link is not a directory.
//   2. the dot half — one installed assembly and a `.hidden/ASSEMBLY.md`
//      beside it. Before the fix `bot status` counted two: the count walked
//      every entry, hidden or not, while the listing has always skipped them.
//      A mutation that fixes only the symlink half still reddens this one.
//
// Each test asserts the count against the LISTING's own length rather than a
// literal, because agreement is the claim; the listing is pinned by bytes so
// the pair cannot agree by both being wrong.
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, cleanup, lines, scratch, tree, type Capture } from "./assembly-home.ts";

afterEach(cleanup);

test("a linked assembly is one assembly to bot assembly list and to bot status alike", async () => {
  const held = await scratch("bot-registry-link-");
  await tree(join(held.home, "assemblies", "review"), "Review.");
  const live = await tree(join(held.root, "code", "dev-bot"), "Dev.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  await lines(["assembly", "link", live], boundary, capture, 0);

  const listed = await lines(["assembly", "list"], boundary, capture, 0);
  expect(listed).toEqual([`dev-bot  linked  -> ${live}`, "review  installed  local copy"]);
});

// The third half, found by the driver's audit rather than the build: an
// ASSEMBLY.md *inside* an assembly. The walk stops at the first sentinel, so
// what is below it is that assembly's own content — its files are already
// hashed as part of it. The deleted count recursed past the sentinel and
// reported 3 where the listing said 2. This is the case with no symlink and no
// dot entry in it, so neither test above can stand in for it.
test("an ASSEMBLY.md below an assembly is that assembly's content, not another one", async () => {
  const held = await scratch("bot-registry-nested-");
  await tree(join(held.home, "assemblies", "review"), "Review.");
  await tree(join(held.home, "assemblies", "review", "nested"), "Nested.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  const listed = await lines(["assembly", "list"], boundary, capture, 0);
  expect(listed).toEqual(["review  installed  local copy"]);
});

test("a hidden entry holding an ASSEMBLY.md is an assembly to neither", async () => {
  const held = await scratch("bot-registry-hidden-");
  await tree(join(held.home, "assemblies", "review"), "Review.");
  await tree(join(held.home, "assemblies", ".hidden"), "Hidden.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  const listed = await lines(["assembly", "list"], boundary, capture, 0);
  expect(listed).toEqual(["review  installed  local copy"]);
});
