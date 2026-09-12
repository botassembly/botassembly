import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, cleanup, lines, scratch, tree, type Capture } from "./assembly-home.ts";

afterEach(cleanup);

interface InstalledFile { path: string; bytes: string; executable: boolean }

async function files(root: string, relative = ""): Promise<InstalledFile[]> {
  const found: InstalledFile[] = [];
  for (const entry of (await readdir(join(root, relative), { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (relative.length === 0 && entry.name === ".bot-source") continue;
    const path = relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) found.push(...await files(root, path));
    else if (entry.isFile()) {
      const mode = (await stat(join(root, path))).mode;
      found.push({ path, bytes: (await readFile(join(root, path))).toString("base64"), executable: (mode & 0o111) !== 0 });
    }
  }
  return found;
}

async function sourceTree(root: string): Promise<string> {
  await tree(root, "Review.");
  await Promise.all([
    writeFile(join(root, ".root-hidden"), "root hidden\n"),
    writeFile(join(root, ".bot-source"), "source-controlled\n"),
    mkdir(join(root, ".root-store", "runs"), { recursive: true }),
    mkdir(join(root, "flows", "main", ".nested-store"), { recursive: true }),
    writeFile(join(root, "flows", "main", ".nested-hidden"), "nested hidden\n"),
    writeFile(join(root, "flows", "main", ".bot-source"), "nested marker\n"),
    writeFile(join(root, "flows", "main", "gate.sh"), "#!/bin/sh\nexit 0\n"),
  ]);
  await Promise.all([
    writeFile(join(root, ".root-store", "runs", "state.json"), "{}\n"),
    writeFile(join(root, "flows", "main", ".nested-store", "state.json"), "{}\n"),
    chmod(join(root, "flows", "main", "gate.sh"), 0o755),
  ]);
  return root;
}

function git(root: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: root, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
}

async function repository(root: string): Promise<{ work: string; bare: string }> {
  const work = await sourceTree(join(root, "work"));
  git(work, "init", "--quiet", "--initial-branch", "main");
  git(work, "config", "user.email", "corpus@example.invalid");
  git(work, "config", "user.name", "Corpus");
  git(work, "add", "-f", "-A");
  git(work, "commit", "--quiet", "-m", "first");
  const bare = join(root, "source.git");
  execFileSync("git", ["clone", "--quiet", "--bare", work, bare]);
  return { work, bare };
}

function expectHiddenOmitted(installed: string): void {
  expect(existsSync(join(installed, ".root-hidden"))).toBe(false);
  expect(existsSync(join(installed, ".root-store"))).toBe(false);
  expect(existsSync(join(installed, ".git"))).toBe(false);
  expect(existsSync(join(installed, "flows", "main", ".nested-hidden"))).toBe(false);
  expect(existsSync(join(installed, "flows", "main", ".nested-store"))).toBe(false);
  expect(existsSync(join(installed, "flows", "main", ".bot-source"))).toBe(false);
  expect(existsSync(join(installed, ".bot-source"))).toBe(true);
}

test("local and Git copies omit every source dot-entry and preserve visible bytes and executable bits", async () => {
  const held = await scratch("bot-install-hidden-parity-");
  const source = await repository(held.root);
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  await lines(["assembly", "install", source.work, "--name", "local"], boundary, capture, 0);
  await lines(["assembly", "install", `file://${source.bare}`, "--name", "git"], boundary, capture, 0);

  const local = join(held.home, "assemblies", "local");
  const cloned = join(held.home, "assemblies", "git");
  expectHiddenOmitted(local);
  expectHiddenOmitted(cloned);
  expect(await files(cloned)).toEqual(await files(local));
  expect((await stat(join(local, "flows", "main", "gate.sh"))).mode & 0o111).toBe(0o111);
  await expect(readFile(join(local, ".bot-source"), "utf8")).resolves.toBe(`${source.work}\n2026-08-02T12:00:00.000Z\n`);
  await expect(readFile(join(cloned, ".bot-source"), "utf8")).resolves.toBe(`file://${source.bare}\n2026-08-02T12:00:00.000Z\n`);
});

test("a selected root with a dot-prefixed basename still copies under its explicit visible name", async () => {
  const held = await scratch("bot-install-hidden-root-");
  const source = await sourceTree(join(held.root, "sources", ".review"));
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  await lines(["assembly", "install", source, "--name", "review"], boundary, capture, 0);

  const installed = join(held.home, "assemblies", "review");
  await expect(readFile(join(installed, "ASSEMBLY.md"), "utf8")).resolves.toContain("Review.");
  expectHiddenOmitted(installed);
});

test("update applies the same exclusion while publishing the complete replacement", async () => {
  const held = await scratch("bot-update-hidden-");
  const source = await sourceTree(join(held.root, "source"));
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  await lines(["assembly", "install", source, "--name", "review"], boundary, capture, 0);

  await Promise.all([
    writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nUpdated.\n"),
    writeFile(join(source, ".added-later"), "hidden\n"),
    writeFile(join(source, "flows", "main", ".added-later"), "hidden\n"),
  ]);
  await lines(["assembly", "update", "review"], boundary, capture, 0);

  const installed = join(held.home, "assemblies", "review");
  await expect(readFile(join(installed, "ASSEMBLY.md"), "utf8")).resolves.toContain("Updated.");
  expectHiddenOmitted(installed);
  expect(existsSync(join(installed, ".added-later"))).toBe(false);
  expect(existsSync(join(installed, "flows", "main", ".added-later"))).toBe(false);
  await expect(readdir(join(held.home, "assemblies"))).resolves.toEqual(["review"]);
});
