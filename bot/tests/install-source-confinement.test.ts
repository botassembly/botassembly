// An install source is untrusted: neither its #subdir locator nor a copied
// provenance marker may redirect a write outside the tree being installed.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, cleanup, scratch, text, tree, type Capture } from "./assembly-home.ts";
import { main } from "../src/cli.ts";

afterEach(cleanup);

function expectRefusal(capture: Capture): void {
  expect(text(capture.out)).toBe("");
  expect(text(capture.err)).toMatch(/^[a-z-]+  .+\n  .+\n$/u);
}

async function bareRepository(root: string): Promise<string> {
  const work = join(root, "work");
  await tree(work, "Review.");
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: work, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  };
  git("init", "--quiet", "--initial-branch", "main");
  git("config", "user.email", "corpus@example.invalid");
  git("config", "user.name", "Corpus");
  git("add", "-A");
  git("commit", "--quiet", "-m", "first");
  const bare = join(root, "source.git");
  execFileSync("git", ["clone", "--quiet", "--bare", work, bare]);
  return bare;
}

test("install — a local #../ subdir cannot escape its source", async () => {
  const held = await scratch("bot-install-confined-local-parent-");
  const source = await tree(join(held.root, "code", "source"), "Source.");
  await tree(join(held.root, "code", "sibling"), "Escaped.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  await expect(main(["assembly", "install", `${source}#../sibling`], boundary)).resolves.toBe(2);
  expectRefusal(capture);
  expect(existsSync(join(held.home, "assemblies", "sibling"))).toBe(false);
});

test("install — a local symlinked #subdir cannot resolve outside its source", async () => {
  const held = await scratch("bot-install-confined-local-link-");
  const source = await tree(join(held.root, "code", "source"), "Source.");
  const escaped = await tree(join(held.root, "code", "sibling"), "Escaped.");
  await symlink(escaped, join(source, "linked"));
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  await expect(main(["assembly", "install", `${source}#linked`], boundary)).resolves.toBe(2);
  expectRefusal(capture);
  expect(existsSync(join(held.home, "assemblies", "linked"))).toBe(false);
});

test("install — a local source cannot redirect the provenance write through a symlink", async () => {
  const held = await scratch("bot-install-confined-local-marker-");
  const outside = join(held.root, "outside.txt");
  const original = Buffer.from("must not change\n");
  await writeFile(outside, original);
  const source = await tree(join(held.root, "source"), "Review.");
  await symlink(outside, join(source, ".bot-source"));
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  const exit = await main(["assembly", "install", source], boundary);
  expect([0, 2]).toContain(exit);
  if (exit === 2) expectRefusal(capture);
  await expect(readFile(outside)).resolves.toEqual(original);
  if (exit === 0) {
    expect(lstatSync(join(held.home, "assemblies", "source", ".bot-source")).isFile()).toBe(true);
  }
});

test("install — a provenance-marker directory is refused or safely replaced", async () => {
  const held = await scratch("bot-install-confined-marker-directory-");
  const source = await tree(join(held.root, "source"), "Review.");
  await mkdir(join(source, ".bot-source"));
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  const exit = await main(["assembly", "install", source], boundary);
  expect([0, 2]).toContain(exit);
  const installed = join(held.home, "assemblies", "source");
  if (exit === 0) {
    expect(lstatSync(join(installed, ".bot-source")).isFile()).toBe(true);
  } else {
    expectRefusal(capture);
    expect(existsSync(installed)).toBe(false);
  }
});

test("install — a cloned source cannot redirect the provenance write through a symlink", async () => {
  const held = await scratch("bot-install-confined-clone-");
  const outside = join(held.root, "outside.txt");
  const original = Buffer.from("must not change\n");
  await writeFile(outside, original);
  const work = join(held.root, "work");
  await tree(work, "Review.");
  await symlink(outside, join(work, ".bot-source"));
  const bare = await bareRepository(held.root);
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  const exit = await main(["assembly", "install", `file://${bare}`], boundary);
  expect([0, 2]).toContain(exit);
  if (exit === 2) expectRefusal(capture);
  await expect(readFile(outside)).resolves.toEqual(original);
  if (exit === 0) {
    expect(lstatSync(join(held.home, "assemblies", "source", ".bot-source")).isFile()).toBe(true);
  }
});
