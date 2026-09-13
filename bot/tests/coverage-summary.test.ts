import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { verifyCoverageSummary } from "../scripts/verify-coverage-summary.mjs";

const execute = promisify(execFile);

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const dimensions = {
  lines: { total: 1, covered: 1, skipped: 0, pct: 100 },
  statements: { total: 1, covered: 1, skipped: 0, pct: 100 },
  functions: { total: 1, covered: 1, skipped: 0, pct: 100 },
  branches: { total: 1, covered: 1, skipped: 0, pct: 100 },
};

async function fixture(summary: (root: string) => unknown): Promise<{ root: string; file: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-coverage-summary-"));
  roots.push(root);
  await mkdir(join(root, "src"));
  await Promise.all([
    writeFile(join(root, "src/a.ts"), "export const a = 1;\n"),
    writeFile(join(root, "src/b.ts"), "export const b = 2;\n"),
  ]);
  const file = join(root, "coverage-summary.json");
  await writeFile(file, JSON.stringify(summary(root)));
  return { root, file };
}

test("the coverage summary contains every production TypeScript module and four dimensions", async () => {
  const complete = await fixture((root) => ({
    total: dimensions,
    [join(root, "src/a.ts")]: dimensions,
    [join(root, "src/b.ts")]: dimensions,
  }));
  expect(await verifyCoverageSummary(complete.file, join(complete.root, "src"))).toEqual({ files: 2 });

  const cases = [
    ["missing source", (root: string) => ({ total: dimensions, [join(root, "src/a.ts")]: dimensions }), "missing src/b.ts"],
    ["unexpected non-source", (root: string) => ({
      total: dimensions,
      [join(root, "src/a.ts")]: dimensions,
      [join(root, "src/b.ts")]: dimensions,
      [join(root, "tests/helper.ts")]: dimensions,
    }), "unexpected tests/helper.ts"],
    ["missing dimension", (root: string) => ({
      total: dimensions,
      [join(root, "src/a.ts")]: dimensions,
      [join(root, "src/b.ts")]: { ...dimensions, branches: undefined },
    }), "src/b.ts has no valid branches coverage"],
  ] as const;

  for (const [name, summary, message] of cases) {
    const held = await fixture(summary);
    await expect(verifyCoverageSummary(held.file, join(held.root, "src")), name).rejects.toThrow(message);
  }

  const malformed = await fixture(() => ({}));
  await expect(verifyCoverageSummary(malformed.file, join(malformed.root, "src"))).rejects.toThrow("summary has no valid total coverage");
});

test("the direct verifier keeps its zero-argument working-directory contract", async () => {
  const complete = await fixture((root) => ({
    total: dimensions,
    [join(root, "src/a.ts")]: dimensions,
    [join(root, "src/b.ts")]: dimensions,
  }));
  await mkdir(join(complete.root, "coverage"));
  await writeFile(join(complete.root, "coverage/coverage-summary.json"), await readFile(complete.file));
  const script = resolve(import.meta.dirname, "../scripts/verify-coverage-summary.mjs");
  const { stdout, stderr } = await execute(process.execPath, [script], { cwd: complete.root });
  expect(stdout).toBe("coverage-summary: 2 production modules across four dimensions.\n");
  expect(stderr).toBe("");
});
