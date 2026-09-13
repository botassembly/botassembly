import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const reads = vi.hoisted(() => ({
  target: "", requested: [] as number[], maximum: Number.MAX_SAFE_INTEGER, failAt: -1,
  mutate: "", mutated: false,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    open: async (...arguments_: Parameters<typeof original.open>) => {
      const descriptor = await original.open(...arguments_);
      if (arguments_[0].toString() !== reads.target) return descriptor;
      return {
        stat: descriptor.stat.bind(descriptor),
        close: descriptor.close.bind(descriptor),
        read: async (buffer: NodeJS.ArrayBufferView, offset: number, length: number, position: number) => {
          reads.requested.push(length);
          if (reads.failAt >= 0 && position >= reads.failAt) throw Object.assign(new Error("read failed"), { code: "EIO" });
          if (reads.mutate !== "" && !reads.mutated && position >= 64 * 1024) {
            reads.mutated = true;
            if (reads.mutate === "append") await original.appendFile(reads.target, "later");
            if (reads.mutate === "replace") {
              await original.rename(reads.target, `${reads.target}.old`);
              await original.writeFile(reads.target, "replacement");
            }
          }
          return descriptor.read(buffer, offset, Math.min(length, reads.maximum), position);
        },
      };
    },
  };
});

import { heldRecord } from "../src/record-lines.ts";
import { visitHeldRecordLines } from "../src/run-files.ts";

const roots: string[] = [];

afterEach(async () => {
  reads.target = "";
  reads.requested = [];
  reads.maximum = Number.MAX_SAFE_INTEGER;
  reads.failAt = -1;
  reads.mutate = "";
  reads.mutated = false;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function recordWith(padding = ""): Promise<{ directory: string; path: string; source: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-record-incremental-"));
  roots.push(root);
  const run = "2026-09-05T12-00-00-abcd";
  const directory = join(root, run);
  const path = join(directory, "record.jsonl");
  const source = [
    JSON.stringify({ record: 1, ts: "2026-09-05T12:00:00.000Z", event: "run_start", run, assembly: "review", assembly_hash: "a".repeat(64), flow: "main", padding }),
    JSON.stringify({ ts: "2026-09-05T12:00:01.000Z", event: "run_end", exit: 0, cause: "success" }),
    "",
  ].join("\n");
  await mkdir(directory, { recursive: true });
  await writeFile(path, source);
  return { directory, path, source };
}

async function rawRecord(bytes: string | Buffer): Promise<{ directory: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-record-segments-"));
  roots.push(root);
  const directory = join(root, "2026-09-05T13-00-00-cafe");
  const path = join(directory, "record.jsonl");
  await mkdir(directory, { recursive: true });
  await writeFile(path, bytes);
  return { directory, path };
}

test("semantic record reading requests fixed chunks instead of the whole held file", async () => {
  const held = await recordWith("x".repeat(150_000));
  reads.target = held.path;

  await expect(heldRecord(held.directory)).resolves.toMatchObject({ classification: "valid" });

  expect(reads.requested.length).toBeGreaterThan(2);
  expect(Math.max(...reads.requested)).toBeLessThan(held.source.length);
});

test("semantic record reading completes short positional reads", async () => {
  const held = await recordWith("x".repeat(70_000));
  reads.target = held.path;
  reads.maximum = 7;

  const record = await heldRecord(held.directory);

  expect(record).toMatchObject({ classification: "valid", source: { size: Buffer.byteLength(held.source) } });
  expect(`${record?.lines.join("\n") ?? ""}\n`).toBe(held.source);
  expect(reads.requested.length).toBeGreaterThan(10_000);
});

test("the torn segment is validated and counts toward the 10,000-segment bound", async () => {
  const atLimit = await rawRecord(`${"{}\n".repeat(9_999)}{}`);
  const overLimit = await rawRecord(`${"{}\n".repeat(10_000)}{}`);

  const accepted = await visitHeldRecordLines(atLimit.directory, "record.jsonl", () => undefined);
  const refused = await visitHeldRecordLines(overLimit.directory, "record.jsonl", () => undefined);

  expect(accepted).toMatchObject({ kind: "held", torn: 10_000 });
  expect(refused).toEqual({ kind: "too-large" });
});

test("a torn invalid UTF-8 segment invalidates the record without publishing partial data", async () => {
  const start = `${JSON.stringify({ record: 1, ts: "2026-09-05T13:00:00.000Z", event: "run_start", run: "2026-09-05T13-00-00-cafe", assembly: "review", flow: "main" })}\n`;
  const held = await rawRecord(Buffer.concat([Buffer.from(start), Buffer.from([0xff])]));

  const record = await heldRecord(held.directory);

  expect(record).toMatchObject({ events: [], lines: [], fault: { mark: "bad-record" } });
  expect(record?.fault?.says).toMatch(/not valid UTF-8/iu);
});

test("complete record lines preserve carriage returns", async () => {
  const run = "2026-09-05T13-00-00-cafe";
  const lines = [
    JSON.stringify({ record: 1, ts: "2026-09-05T13:00:00.000Z", event: "run_start", run, assembly: "review", flow: "main" }),
    JSON.stringify({ ts: "2026-09-05T13:00:01.000Z", event: "run_end", exit: 0, cause: "success" }),
  ];
  const held = await rawRecord(`${lines.join("\r\n")}\r\n`);

  const record = await heldRecord(held.directory);

  expect(record).toMatchObject({ classification: "valid" });
  expect(record?.lines).toEqual(lines.map((line) => `${line}\r`));
});

test("a read failure discards lines visited before the failure", async () => {
  const held = await recordWith("x".repeat(150_000));
  reads.target = held.path;
  reads.failAt = 64 * 1024;

  const record = await heldRecord(held.directory);

  expect(record).toMatchObject({ events: [], lines: [], fault: { mark: "unreadable" } });
  expect(record?.fault?.says).toContain("EIO");
});

test.each(["append", "replace"] as const)("a mid-read %s fails stability and discards visited lines", async (mode) => {
  const held = await recordWith("x".repeat(150_000));
  reads.target = held.path;
  reads.mutate = mode;

  const record = await heldRecord(held.directory);

  expect(reads.mutated).toBe(true);
  expect(record).toMatchObject({ events: [], lines: [], fault: { mark: "unreadable" } });
});

function earlyContentFailure(kind: "invalid UTF-8" | "segment limit"): Buffer {
  if (kind === "invalid UTF-8") return Buffer.concat([Buffer.from([0xff, 0x0a]), Buffer.alloc(150_000, "x")]);
  return Buffer.from(`${"{}\n".repeat(10_001)}${"x".repeat(100_000)}`);
}

test.each([
  ["invalid UTF-8", "read error"],
  ["invalid UTF-8", "append"],
  ["invalid UTF-8", "replacement"],
  ["segment limit", "read error"],
  ["segment limit", "append"],
  ["segment limit", "replacement"],
] as const)("an early %s failure yields to a later %s", async (content, later) => {
  const held = await rawRecord(earlyContentFailure(content));
  reads.target = held.path;
  if (later === "read error") reads.failAt = 64 * 1024;
  if (later === "append") reads.mutate = "append";
  if (later === "replacement") reads.mutate = "replace";

  const record = await heldRecord(held.directory);

  expect(record).toMatchObject({ events: [], lines: [], fault: { mark: "unreadable" } });
  if (later === "read error") expect(record?.fault?.says).toContain("EIO");
  else expect(reads.mutated).toBe(true);
});
