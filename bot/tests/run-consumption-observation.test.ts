import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const reads = vi.hoisted(() => ({ records: [] as string[], files: [] as string[] }));

vi.mock("../src/run-files.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/run-files.ts")>();
  return {
    ...actual,
    visitHeldRecordLines: async (...args: Parameters<typeof actual.visitHeldRecordLines>) => {
      reads.records.push(`${args[0]}/${args[1]}`);
      return actual.visitHeldRecordLines(...args);
    },
    heldRunFile: async (...args: Parameters<typeof actual.heldRunFile>) => {
      reads.files.push(`${args[0]}/${args[1]}`);
      return actual.heldRunFile(...args);
    },
    // The child-agreement reader opens a retained request under the writer's
    // own ingestion ceiling, so the observation follows that door too.
    boundedHeldRunFile: async (...args: Parameters<typeof actual.boundedHeldRunFile>) => {
      reads.files.push(`${args[0]}/${args[1]}`);
      return actual.boundedHeldRunFile(...args);
    },
  };
});

import { inspectRuns, readRunState } from "../src/inspection.ts";
import { hashBytes } from "../src/record.ts";
import type { RunListQuery } from "../src/run-list-query.ts";
import { currentRecord } from "./current-record.ts";

const roots: string[] = [];
const TS = "2026-09-13T12:00:00.000Z";
const HASH = "a".repeat(64);
const CHILD = "stages/01-work/1/1/subflows/1";
const stageStart = { event: "stage_start", ts: TS, stage: "01-work", retry: 1 };
const stageEnd = { event: "stage_end", ts: TS, stage: "01-work", retry: 1, exit: 0, cause: "success" };
const runEnd = { event: "run_end", ts: TS, exit: 0, cause: "success" };

afterEach(async () => {
  reads.records = [];
  reads.files = [];
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function start(run: string, request: Record<string, unknown>): Record<string, unknown> {
  return { record: 1, event: "run_start", ts: TS, run, assembly: "review", assembly_hash: HASH, flow: run === "root" ? "main" : "child", request };
}

function turn(total: number): Record<string, unknown> {
  return { event: "turn", ts: TS, stage: "01-work", retry: 1, provider: "provider", model: "model",
    input: 0, output: total, cache_read: 0, cache_write: 0, total, stop: "stop" };
}

async function fixture(requestName: string, writeRequest = true): Promise<{ home: string; run: string; directory: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-consumption-observe-"));
  roots.push(root);
  const home = join(root, "home"), run = "root", directory = join(home, "runs", run), childDirectory = join(directory, CHILD);
  const bytes = Buffer.from("child request"), sha256 = hashBytes(bytes);
  const input = { path: `${CHILD}/${requestName}`, bytes: bytes.length, sha256 };
  await mkdir(childDirectory, { recursive: true });
  await writeFile(join(directory, "record.jsonl"), currentRecord([
    start(run, { path: "request.txt", bytes: 0, sha256: HASH, via: "argument" }), stageStart, turn(2),
    { event: "subflow_call", ts: TS, stage: "01-work", retry: 1, call: 1, flow: "child", depth: 1,
      input, started: true, child: CHILD, exit: 0, cause: "success" },
    stageEnd, runEnd,
  ]));
  if (writeRequest) await writeFile(join(childDirectory, requestName), bytes);
  await writeFile(join(childDirectory, "record.jsonl"), currentRecord([
    start("1", { path: requestName, bytes: bytes.length, sha256, via: "subflow" }), stageStart, turn(5), stageEnd, runEnd,
  ]));
  reads.records = [];
  reads.files = [];
  return { home, run, directory };
}

test.each(["session.jsonl", "output.txt", "provider.json", "other.md"])(
  "child agreement never opens non-request artifact %s",
  async (name) => {
    const held = await fixture(name);
    await expect(readRunState(held.home, held.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "partial" });
    expect(reads.files).toEqual([]);
  },
);

test("child agreement opens only an admitted request filename", async () => {
  const held = await fixture("request.txt");
  await expect(readRunState(held.home, held.run)).resolves.toMatchObject({ tokens: 7, tokensStatus: "complete" });
  expect(reads.files).toEqual([`${join(held.directory, CHILD)}/request.txt`]);
});

test("child agreement enforces the exact request extension boundary before opening", async () => {
  const admittedName = `request.${"a".repeat(247)}`;
  const admitted = await fixture(admittedName);
  await expect(readRunState(admitted.home, admitted.run)).resolves.toMatchObject({ tokens: 7, tokensStatus: "complete" });
  expect(reads.files).toEqual([`${join(admitted.directory, CHILD)}/${admittedName}`]);

  reads.records = [];
  reads.files = [];
  const tooLong = await fixture(`request.${"a".repeat(248)}`, false);
  await expect(readRunState(tooLong.home, tooLong.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "partial" });
  expect(reads.files).toEqual([]);
});

test("count mode reads no descendant record or request", async () => {
  const held = await fixture("request.txt");
  const result = await inspectRuns(held.home, { all: true }, true);
  expect(result.exitCode).toBe(0);
  expect(reads.records).toEqual([`${held.directory}/record.jsonl`, `${join(held.directory, CHILD)}/record.jsonl`]);
  expect(reads.files).toHaveLength(1);
  reads.records = [];
  reads.files = [];
  const { inspectRunList } = await import("../src/run-list.ts");
  const query: RunListQuery = {
    assemblies: [], flows: [], states: [], causes: [], fields: ["id"],
    json: true, count: true, limit: 20,
  };
  await inspectRunList(held.home, query);
  expect(reads.records).toEqual([`${held.directory}/record.jsonl`]);
  expect(reads.files).toEqual([]);
});

test("hostile references and unrelated child-shaped directories are never traversed", async () => {
  const held = await fixture("request.txt");
  const hostile = { event: "subflow_call", ts: TS, stage: "01-work", retry: 1, call: 1, flow: "child", depth: 1,
    input: { text: "", bytes: 0, sha256: hashBytes("") }, started: true, child: "../provider" };
  await writeFile(join(held.directory, "record.jsonl"), currentRecord([
    start("root", { path: "request.txt", bytes: 0, sha256: HASH, via: "argument" }), stageStart, turn(2), hostile, stageEnd, runEnd,
  ]));
  reads.records = [];
  reads.files = [];
  await expect(readRunState(held.home, held.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "partial" });
  expect(reads.records).toEqual([`${held.directory}/record.jsonl`]);
  expect(reads.files).toEqual([]);

  await writeFile(join(held.directory, "record.jsonl"), currentRecord([
    start("root", { path: "request.txt", bytes: 0, sha256: HASH, via: "argument" }), stageStart, turn(2), stageEnd, runEnd,
  ]));
  reads.records = [];
  await expect(readRunState(held.home, held.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "complete" });
  expect(reads.records).toEqual([`${held.directory}/record.jsonl`]);
});
