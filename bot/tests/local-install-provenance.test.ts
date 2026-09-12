// Ticket 0010 — a local install remembers the canonical source it fetched.
// These use two caller directories with the same relative locator: the second
// is a convincing wrong source, so an update can only pass by using provenance.
import { readFileSync } from "node:fs";
import { mkdir, realpath, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, cleanup, lines, scratch, text, tree, type Capture } from "./assembly-home.ts";
import { main } from "../src/cli.ts";

afterEach(cleanup);

function from(boundary: ReturnType<typeof boundaryFor>, cwd: string): ReturnType<typeof boundaryFor> {
  return { ...boundary, cwd, env: { ...boundary.env, PWD: cwd } };
}

test("install — a relative local #subdir records and lists the real absolute source", async () => {
  const held = await scratch("bot-local-provenance-record-");
  const source = join(held.root, "original", "bots");
  await tree(join(source, "review"), "Original review.");
  const caller = join(held.root, "install-here");
  await mkdir(caller);
  await symlink(source, join(caller, "bots"));
  const capture: Capture = { out: [], err: [] };
  const boundary = from(boundaryFor(held.root, held.home, capture), caller);
  const provenance = `${await realpath(source)}#review`;

  await lines(["assembly", "install", "./bots#review"], boundary, capture, 0);

  const installed = join(held.home, "assemblies", "review");
  expect(readFileSync(join(installed, ".bot-source"), "utf8"))
    .toBe(`${provenance}\n2026-08-02T12:00:00.000Z\n`);
  expect(await lines(["assembly", "list"], boundary, capture, 0))
    .toEqual([`review  installed  from ${provenance}  updated 2026-08-02T12:00:00.000Z`]);
});

test("update — a missing recorded local source refuses at that source rather than a same-named cwd tree", async () => {
  const held = await scratch("bot-local-provenance-missing-");
  const source = join(held.root, "original", "bots");
  await tree(join(source, "review"), "Original review.");
  const installCwd = join(held.root, "install-here");
  const updateCwd = join(held.root, "update-here");
  await Promise.all([mkdir(installCwd), tree(join(updateCwd, "bots", "review"), "Wrong review.")]);
  await symlink(source, join(installCwd, "bots"));
  const provenance = `${await realpath(source)}#review`;
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  await lines(["assembly", "install", "./bots#review"], from(boundary, installCwd), capture, 0);
  await rm(source, { recursive: true });

  await expect(main(["assembly", "update", "review"], from(boundary, updateCwd))).resolves.toBe(2);
  expect(text(capture.err)).toBe(`path-missing  ${provenance}\n  Name a source folder that exists.\n`);
  expect(readFileSync(join(held.home, "assemblies", "review", "ASSEMBLY.md"), "utf8")).toContain("Original review.");
});

test("update — a recorded local source that stops being an assembly refuses instead of taking a same-named cwd tree", async () => {
  const held = await scratch("bot-local-provenance-marker-");
  const source = join(held.root, "original", "bots");
  await tree(join(source, "review"), "Original review.");
  const installCwd = join(held.root, "install-here");
  const updateCwd = join(held.root, "update-here");
  await Promise.all([mkdir(installCwd), tree(join(updateCwd, "bots", "review"), "Wrong review.")]);
  await symlink(source, join(installCwd, "bots"));
  const provenance = `${await realpath(source)}#review`;
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  await lines(["assembly", "install", "./bots#review"], from(boundary, installCwd), capture, 0);
  await rm(join(source, "review", "ASSEMBLY.md"));

  await expect(main(["assembly", "update", "review"], from(boundary, updateCwd))).resolves.toBe(2);
  expect(text(capture.err)).toBe(`assembly-unknown  ${provenance}\n  Name an assembly; what is there is not one.\n`);
  expect(readFileSync(join(held.home, "assemblies", "review", "ASSEMBLY.md"), "utf8")).toContain("Original review.");
});
