import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finished } from "node:stream/promises";
import { afterEach, expect, test } from "vitest";
import type { FlowSource } from "../src/execution.ts";
import type { CopiedRunFile, HeldRunSource } from "../src/run-files.ts";
import { materializeSources } from "../src/source-materialization.ts";
import { hashBytes } from "../src/record.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function source(name: string, copy: HeldRunSource["copy"]): FlowSource {
  return {
    name, extension: "txt", diskPath: "/held/only", record: { path: "held/only", sha256: "expected" },
    held: { size: 7, sha256: "expected", copy, close: () => Promise.resolve() },
  };
}

async function partial(destination: Parameters<HeldRunSource["copy"]>[0], result: CopiedRunFile) {
  const writer = destination();
  writer.end("partial");
  await finished(writer);
  return result;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bot-source-materialization-"));
  roots.push(root);
  const input = join(root, "input");
  await mkdir(input);
  return { root, input };
}

test.each([
  { kind: "copied", size: 7, sha256: "wrong" } as const,
  { kind: "interrupted", phase: "read", error: new Error("short read") } as const,
  { kind: "interrupted", phase: "write", error: new Error("write failed") } as const,
  { kind: "interrupted", phase: "close", error: new Error("close failed") } as const,
])("materialization removes a partial destination after $kind", async (result) => {
  const { root, input } = await fixture();
  await expect(materializeSources(root, input, [source("only", (destination) => partial(destination, result))])).rejects.toThrow();
  await expect(readFile(join(input, "only.txt"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("materialization waits for every started copy before reporting failure", async () => {
  const { root, input } = await fixture();
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let settled = false;
  const running = materializeSources(root, input, [
    source("first", (destination) => partial(destination, { kind: "interrupted", phase: "read" })),
    source("second", async (destination) => { await held; return partial(destination, { kind: "copied", size: 7, sha256: "wrong" }); }),
  ]).finally(() => { settled = true; });
  await new Promise<void>((resolve) => { setImmediate(resolve); });
  expect(settled).toBe(false);
  release();
  await expect(running).rejects.toThrow();
  await expect(Promise.all([readFile(join(input, "first.txt")), readFile(join(input, "second.txt"))])).rejects.toBeDefined();
});

test("ordinary zero-byte materialization creates an empty destination", async () => {
  const { root, input } = await fixture();
  await writeFile(join(root, "empty.txt"), Buffer.alloc(0));
  await materializeSources(root, input, [{
    name: "empty", extension: "txt", diskPath: join(root, "empty.txt"),
    record: { path: "empty.txt", sha256: hashBytes(Buffer.alloc(0)) },
  }]);
  await expect(readFile(join(input, "empty.txt"))).resolves.toEqual(Buffer.alloc(0));
});

test("ordinary materialization reads diskPath when the recorded path is not beneath the run", async () => {
  const { root, input } = await fixture();
  const bytes = Buffer.from("ordinary source\n");
  const diskPath = join(root, "outside-run.txt");
  await writeFile(diskPath, bytes);
  await materializeSources(root, input, [{
    name: "ordinary", extension: "txt", diskPath,
    record: { path: "not-present-beneath-run.txt", sha256: hashBytes(bytes) },
  }]);
  await expect(readFile(join(input, "ordinary.txt"))).resolves.toEqual(bytes);
});
