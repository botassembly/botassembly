import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { runSearchReading } from "../src/public-run-readings.ts";

const roots: string[] = [];
const hasRealRg = spawnSync("/bin/sh", ["-c", "command -v rg >/dev/null 2>&1"], { env: { PATH: process.env["PATH"] }, stdio: "ignore" }).status === 0;
afterEach(async () => { const { rm } = await import("node:fs/promises"); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(): Promise<{ root: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-run-search-")); roots.push(root);
  const home = join(root, "home"), first = join(home, "runs", "a+"), second = join(home, "runs", "a", "b");
  await Promise.all([
    mkdir(join(first, "stages", "01-read", "1"), { recursive: true }),
    mkdir(join(second, "stages", "02-write", "2"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(first, "record.jsonl"), '{"stage":"root","repeat":3,"retry":2,"text":"a+b a+b"}\n'),
    writeFile(join(first, "stages", "01-read", "1", "session.jsonl"), '{"text":"a+b"}\n'),
    writeFile(join(second, "record.jsonl"), 'invalid a+b event\n'),
    writeFile(join(second, "stages", "02-write", "2", "session.jsonl"), '{"text":"a+b"}\n'),
    writeFile(join(first, "request.txt"), "a+b excluded\n"),
  ]);
  return { root, home };
}

test.skipIf(!hasRealRg)("real ripgrep searches literal retained lines in bytewise file order", async () => {
  const held = await fixture();
  const result = await runSearchReading(held.home, "a+b", { json: true }, held.root, { PATH: process.env["PATH"] });
  expect(result.exit).toBe(0); expect(result.stderr.toString()).toBe("");
  const document = JSON.parse(result.stdout.toString()) as { data: { tool: { name: string }; hits: Array<Record<string, unknown>> }; summary: { candidateFiles: number; returned: number } };
  expect(document.data.tool.name).toBe("rg");
  expect(document.summary).toEqual({ candidateFiles: 4, returned: 4 });
  expect(document.data.hits.map((hit) => hit["file"])).toEqual([
    "a+/record.jsonl", "a+/stages/01-read/1/session.jsonl", "a/b/record.jsonl", "a/b/stages/02-write/2/session.jsonl",
  ]);
  expect(document.data.hits[0]).toMatchObject({ run: "a+", stage: "root", repeat: 3, retry: 2, line: 1 });
  expect(document.data.hits[1]).toMatchObject({ run: "a+", stage: "01-read", repeat: 1, retry: null, line: 1 });
  expect(document.data.hits[2]).toMatchObject({ run: "a", stage: null, repeat: null, retry: null, line: 1 });
});

test("real grep fallback uses the same candidates and handles colons", async () => {
  const held = await fixture(), bin = join(held.root, "bin"); await mkdir(bin); await symlink("/usr/bin/grep", join(bin, "grep"));
  await mkdir(join(held.home, "runs", "z:run")); await writeFile(join(held.home, "runs", "z:run", "record.jsonl"), "a+b:colon\n");
  await mkdir(join(held.home, "runs", "zz")); await writeFile(join(held.home, "runs", "zz", "record.jsonl"), Buffer.from([0x61, 0x2b, 0x62, 0x20, 0xff, 0x0a]));
  const result = await runSearchReading(held.home, "a+b", { json: true }, held.root, { PATH: bin });
  expect(result.exit).toBe(0);
  const document = JSON.parse(result.stdout.toString()) as { data: { tool: { name: string }; hits: Array<{ file: string; text: string }> } };
  expect(document.data.tool.name).toBe("grep");
  expect(document.data.hits.map((hit) => hit.file)).toEqual(["a+/record.jsonl", "a+/stages/01-read/1/session.jsonl", "a/b/record.jsonl", "a/b/stages/02-write/2/session.jsonl", "z:run/record.jsonl", "zz/record.jsonl"]);
  expect(document.data.hits.at(-2)).toMatchObject({ file: "z:run/record.jsonl", text: "a+b:colon" });
  expect(document.data.hits.at(-1)).toMatchObject({ file: "zz/record.jsonl", text: "a+b �" });
  const empty = await runSearchReading(held.home, "absent", { json: true }, held.root, { PATH: bin });
  expect(empty.exit).toBe(0); expect((JSON.parse(empty.stdout.toString()) as { data: { hits: unknown[] } }).data.hits).toEqual([]);
});

test("paging returns a bound cursor with no duplicate stable hits", async () => {
  const held = await fixture();
  const first = await runSearchReading(held.home, "a+b", { json: true, limit: 1 }, held.root, { PATH: process.env["PATH"] });
  const one = JSON.parse(first.stdout.toString()) as { data: { hits: Array<{ file: string }> }; page: { next: string; complete: boolean } };
  expect(one.page.complete).toBe(false); expect(one.data.hits).toHaveLength(1);
  const second = await runSearchReading(held.home, "a+b", { json: true, limit: 1, after: one.page.next }, held.root, { PATH: process.env["PATH"] });
  const two = JSON.parse(second.stdout.toString()) as { data: { hits: Array<{ file: string }> } };
  expect(two.data.hits[0]?.file).not.toBe(one.data.hits[0]?.file);
});

test("missing tools and invalid requests refuse with empty stdout", async () => {
  const held = await fixture(), empty = join(held.root, "empty"); await mkdir(empty);
  const missing = await runSearchReading(held.home, "needle", { json: true }, held.root, { PATH: empty });
  expect(missing.exit).toBe(4); expect(missing.stdout.length).toBe(0);
  expect(JSON.parse(missing.stderr.toString())).toMatchObject({ error: { code: "dependency-failed", cause: "dependency-failed" } });
  const invalid = await runSearchReading(held.home, "bad\nquery", { json: true }, held.root, { PATH: empty });
  expect(invalid.exit).toBe(2); expect(invalid.stdout.length).toBe(0);
  expect(JSON.parse(invalid.stderr.toString())).toMatchObject({ error: { code: "request-invalid", cause: "argument-invalid" } });
});
