// The record conformance corpus preserves an immutable current-shape fixture.
// It carries additive fields, which the reader must ignore without changing
// the established inspection or rewriting the retained bytes.
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { mapping } from "../src/model.ts";
import { invokeCliBytes } from "./invoke.ts";

const CORPUS = new URL("../../specification/conformance/records", import.meta.url).pathname;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtures(): Promise<string[]> {
  return (await readdir(CORPUS, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function runName(record: Buffer): string {
  const first = record.toString("utf8").split("\n")[0] ?? "";
  const value: unknown = JSON.parse(first);
  if (!mapping(value) || typeof value["run"] !== "string") throw new Error("Frozen record fixture has no run name.");
  return value["run"];
}

test("every frozen current-shape record renders without rewriting retained bytes", async () => {
  for (const named of await fixtures()) {
    const fixture = join(CORPUS, named);
    const source = await readFile(join(fixture, "record.jsonl"));
    const root = await mkdtemp(join(tmpdir(), "bot-record-conformance-"));
    roots.push(root);
    const home = join(root, "home");
    const run = runName(source);
    const held = join(home, "runs", run, "record.jsonl");
    await mkdir(join(home, "runs", run), { recursive: true });
    await copyFile(join(fixture, "record.jsonl"), held);

    const shown = await invokeCliBytes(["run", "events", run], { home });
    expect(shown.code, named).toBe(0);
    expect(shown.err, named).toEqual(Buffer.alloc(0));
    expect(shown.out, named).toEqual(await readFile(join(fixture, "expected.txt")));
    await expect(readFile(held), named).resolves.toEqual(source);
  }
});
