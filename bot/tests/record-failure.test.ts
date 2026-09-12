import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { runEndEvent, runStartEvent, signalEvent, stageStartEvent } from "../src/record-events.ts";
import { createRecordWriter, hashBytes, type RecordWriter } from "../src/record.ts";
import { assembly, flow, roots as flowRoots, stage, start, writes, type Script } from "./flow-harness.ts";

const durability = vi.hoisted(() => ({ calls: 0, failure: undefined as Error | undefined }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    open: async (...arguments_: Parameters<typeof original.open>) => {
      const handle = await original.open(...arguments_);
      if (!arguments_[0].toString().endsWith("record.jsonl")) return handle;
      return new Proxy(handle, {
        get(target, property) {
          if (property === "sync" || property === "datasync") {
            return async () => {
              durability.calls += 1;
              if (durability.failure !== undefined) throw durability.failure;
              return property === "sync" ? target.sync() : target.datasync();
            };
          }
          const value: unknown = Reflect.get(target, property, target);
          if (typeof value !== "function") return value;
          return (...arguments_: unknown[]): unknown => Reflect.apply(value, target, arguments_) as unknown;
        },
      });
    },
  };
});

const roots: string[] = [];

async function writer(): Promise<RecordWriter> {
  const root = await mkdtemp(join(tmpdir(), "bot-record-failure-"));
  roots.push(root);
  const runs = join(root, "runs");
  await mkdir(runs);
  const created = await createRecordWriter(runs, runStartEvent({
    ts: "2026-08-27T10:00:00.000Z",
    run: "2026-08-27T10-00-00-fail",
    assembly: "record-failure",
    assemblyHash: hashBytes("assembly"),
    flow: "main",
    request: { path: "request.txt", sha256: hashBytes("request"), bytes: 7, via: "stdin" },
  }));
  if (created.status !== "created") throw new Error("temporary record name collided");
  return created.writer;
}

afterEach(async () => {
  durability.calls = 0;
  durability.failure = undefined;
  await Promise.all([...roots.splice(0), ...flowRoots.splice(0)].map((root) => rm(root, { recursive: true, force: true })));
});

test("only run_end makes the record durable before sealing completes", async () => {
  const record = await writer();
  await record.append(signalEvent({ ts: "2026-08-27T10:00:01.000Z", signal: 15, name: "SIGTERM" }));
  expect(durability.calls).toBe(0);

  await record.append(runEndEvent({ ts: "2026-08-27T10:00:02.000Z", exit: 143, cause: "signal" }));
  expect(durability.calls).toBe(1);
});

test("a failed seal sync faults the run with the underlying disk error", async () => {
  const only = stage("flows/main/01-work.md", "work");
  const main = flow("main", "flows/main", [only]);
  const run = await start(main, assembly(main), new Map<string, Script>([
    ["main:01-work:1", writes("finished work")],
  ]));
  durability.failure = Object.assign(new Error("forced seal sync failure"), { code: "EIO" });

  const result = await run.result;
  expect(result).toMatchObject({ exit: 2, cause: "fault" });
  expect(result.reason).toContain("forced seal sync failure");
  expect(durability.calls).toBe(1);
});

test("an unawaited append failure is contained and later appends fail as closed, not as the old I/O", async () => {
  const record = await writer();
  const original = await readFile(record.recordPath);
  await rm(record.recordPath);
  await mkdir(record.recordPath);
  const unhandled: unknown[] = [];
  const observe = (reason: unknown): void => { unhandled.push(reason); };
  process.on("unhandledRejection", observe);
  let firstFailure: unknown;
  try {
    void record.append(signalEvent({ ts: "2026-08-27T10:00:01.000Z", signal: 15, name: "SIGTERM" }));
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    try { await record.drain(); } catch (reason: unknown) { firstFailure = reason; }
  } finally {
    process.removeListener("unhandledRejection", observe);
  }

  expect(firstFailure).toMatchObject({ code: "EISDIR" });
  expect(unhandled).toEqual([]);
  await rm(record.recordPath, { recursive: true });
  await writeFile(record.recordPath, original);
  const later = record.append(stageStartEvent({
    ts: "2026-08-27T10:00:02.000Z", identity: { stage: "01-work", retry: 1 },
    received: [], options: [], session: "stages/01-work/1/session.jsonl",
  }));
  await expect(later).rejects.not.toBe(firstFailure);
  expect(await readFile(record.recordPath)).toEqual(original);
});

test("an append after run_end is rejected and cannot alter the sealed bytes", async () => {
  const record = await writer();
  await record.append(runEndEvent({ ts: "2026-08-27T10:00:01.000Z", exit: 0, cause: "success" }));
  const sealed = await readFile(record.recordPath);

  await expect(record.append(signalEvent({ ts: "2026-08-27T10:00:02.000Z", signal: 15, name: "SIGTERM" }))).rejects.toThrow();
  expect(await readFile(record.recordPath)).toEqual(sealed);
});

test("a failed append during a stage stops the flow immediately as the underlying disk fault", async () => {
  const first = stage("flows/main/01-break.md", "break");
  const second = stage("flows/main/02-continue.md", "continue");
  const main = flow("main", "flows/main", [first, second]);
  let continued = false;
  const run = await start(main, assembly(main), new Map<string, Script>([
    ["main:01-break:1", (context) => [async () => {
      await rm(context.writer.recordPath);
      await mkdir(context.writer.recordPath);
      return fauxAssistantMessage("the first stage answered");
    }]],
    ["main:02-continue:1", () => [() => {
      continued = true;
      return fauxAssistantMessage("the second stage answered");
    }]],
  ]));

  const unhandled: unknown[] = [];
  const observe = (reason: unknown): void => { unhandled.push(reason); };
  process.on("unhandledRejection", observe);
  try {
    const result = await run.result;
    expect(result).toMatchObject({ exit: 2, cause: "fault" });
    expect(result.reason).toContain("EISDIR");
    await new Promise<void>((resolve) => { setImmediate(resolve); });
  } finally {
    process.removeListener("unhandledRejection", observe);
  }
  expect(continued).toBe(false);
  expect(unhandled).toEqual([]);
});
