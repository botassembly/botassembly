import { createHash } from "node:crypto";
import { appendFile, mkdir, rename, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterEach, expect, test } from "vitest";
import type { HeldRunSource } from "../src/run-files.ts";
import { copyVerifiedOutput, type VerifiedOutputDependencies } from "../src/verified-output.ts";
import { tempRoots } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

async function source(bytes = Buffer.alloc(130_000, "a")) {
  const { root } = await roots.scratch("bot-verified-output-");
  const directory = join(root, "run"), path = "stages/01-answer/output.txt";
  await mkdir(join(directory, "stages/01-answer"), { recursive: true });
  await writeFile(join(directory, path), bytes);
  return { bytes, file: join(directory, path), selected: { directory, path, sha256: sha256(bytes) } };
}

function sink(bytes: Buffer[], failure?: NodeJS.ErrnoException): () => Writable {
  return () => new Writable({
    write(chunk: Buffer, _encoding, done) {
      if (failure !== undefined) done(failure);
      else { bytes.push(Buffer.from(chunk)); done(); }
    },
  });
}

test("delivery needs no output-sized temporary storage", async () => {
  const held = await source(), out: Buffer[] = [];
  await expect(copyVerifiedOutput(held.selected, sink(out)))
    .resolves.toEqual({ kind: "copied" });
  expect(Buffer.concat(out)).toEqual(held.bytes);
});

test("a change to unread first-pass bytes fails before stdout", async () => {
  const held = await source(), out: Buffer[] = [];
  const result = await copyVerifiedOutput(held.selected, sink(out), {
    afterFirstChunk: () => writeFile(held.file, Buffer.alloc(held.bytes.length, "b")),
  });
  expect(result).toEqual({ kind: "mismatch" });
  expect(out).toEqual([]);
});

test("a wrong recorded hash fails before stdout", async () => {
  const held = await source(), out: Buffer[] = [];
  await expect(copyVerifiedOutput({ ...held.selected, sha256: "0".repeat(64) }, sink(out)))
    .resolves.toEqual({ kind: "mismatch" });
  expect(out).toEqual([]);
});

test("a wrong recorded byte count fails before stdout", async () => {
  const held = await source(), out: Buffer[] = [];
  await expect(copyVerifiedOutput({ ...held.selected, bytes: held.bytes.length + 1 }, sink(out)))
    .resolves.toEqual({ kind: "mismatch" });
  expect(out).toEqual([]);
});

test("a late in-place change is delivered but fails its second hash", async () => {
  const held = await source(), out: Buffer[] = [];
  const changed = Buffer.alloc(held.bytes.length, "z");
  await expect(copyVerifiedOutput(held.selected, sink(out), {
    afterVerified: () => writeFile(held.file, changed),
  })).resolves.toEqual({ kind: "mismatch" });
  expect(Buffer.concat(out)).toEqual(changed);
});

test.each([
  ["path replacement", async (file: string, bytes: Buffer) => {
    await rename(file, `${file}.old`);
    await writeFile(file, Buffer.alloc(bytes.length, "r"));
  }],
  ["append", async (file: string) => appendFile(file, "later")],
] as const)("%s after open cannot redirect or extend delivery", async (_name, mutate) => {
  const held = await source(), out: Buffer[] = [];
  await expect(copyVerifiedOutput(held.selected, sink(out), {
    afterVerified: () => mutate(held.file, held.bytes),
  })).resolves.toEqual({ kind: "copied" });
  expect(Buffer.concat(out)).toEqual(held.bytes);
});

test("truncation after verification retains its delivery failure and partial bytes", async () => {
  const held = await source(), out: Buffer[] = [];
  const retained = 70_000;
  const result = await copyVerifiedOutput(held.selected, sink(out), {
    afterVerified: () => truncate(held.file, retained),
  });
  expect(result).toMatchObject({ kind: "fault", phase: "delivery" });
  expect(Buffer.concat(out)).toEqual(held.bytes.subarray(0, retained));
});

test("stdout failure exposes only a verified source prefix", async () => {
  const held = await source(), out: Buffer[] = [];
  const failure = Object.assign(new Error("full"), { code: "ENOSPC" });
  let writes = 0;
  const result = await copyVerifiedOutput(held.selected, () => new Writable({
    write(bytes: Buffer, _encoding, done) {
      writes += 1;
      if (writes === 1) { out.push(Buffer.from(bytes)); done(); }
      else done(failure);
    },
  }));
  expect(result).toMatchObject({ kind: "fault", phase: "delivery", error: failure });
  expect(Buffer.concat(out).length).toBeGreaterThan(0);
  expect(Buffer.concat(out)).toEqual(held.bytes.subarray(0, Buffer.concat(out).length));
});

test("EPIPE remains a quiet successful delivery", async () => {
  const held = await source(), out: Buffer[] = [];
  const pipe = Object.assign(new Error("closed"), { code: "EPIPE" });
  await expect(copyVerifiedOutput(held.selected, sink(out, pipe)))
    .resolves.toEqual({ kind: "copied" });
});

test("a descriptor-close failure keeps its cleanup phase", async () => {
  const held = await source();
  const failure = Object.assign(new Error("close"), { code: "EBADF" });
  const heldSource: HeldRunSource = {
    size: held.bytes.length,
    sha256: held.selected.sha256,
    close: () => Promise.reject(failure),
    copy: () => Promise.resolve({ kind: "interrupted", phase: "close", error: failure }),
  };
  const dependencies: VerifiedOutputDependencies = { holdSource: () => Promise.resolve(heldSource) };
  await expect(copyVerifiedOutput(held.selected, sink([]), dependencies))
    .resolves.toEqual({ kind: "fault", phase: "cleanup", error: failure });
});

test.each([Buffer.alloc(0), Buffer.from([0, 0xff, 0x7c])])("empty and binary output stays exact", async (bytes) => {
  const held = await source(bytes), out: Buffer[] = [];
  await expect(copyVerifiedOutput(held.selected, sink(out))).resolves.toEqual({ kind: "copied" });
  expect(Buffer.concat(out)).toEqual(bytes);
});
