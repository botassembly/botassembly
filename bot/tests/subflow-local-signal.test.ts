import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createAgentClock } from "../src/clock.ts";
import { runStartEvent } from "../src/record-events.ts";
import { createRecordWriter, hashBytes } from "../src/record.ts";
import { createRunSignal } from "../src/signal.ts";
import { runSubflowBatch } from "../src/subflow-runtime.ts";
import { bounded } from "./hostile.ts";
import { assembly, events, flow, roots, stage, start, type Script } from "./flow-harness.ts";
import { manualClock } from "./manual-clock.ts";

const lockControl = vi.hoisted(() => ({
  locks: [] as { directory: string; fail: (reason: Error) => void }[],
  waiters: [] as { count: number; resolve: () => void }[],
}));

vi.mock("../src/run-lock.ts", () => ({
  lockActiveRun: (directory: string) => {
    const compromised = new Promise<never>((_resolve, reject) => {
      lockControl.locks.push({ directory, fail: (reason: Error) => { reject(reason); } });
      for (const waiter of lockControl.waiters) if (lockControl.locks.length >= waiter.count) waiter.resolve();
    });
    return { compromised, release: () => undefined };
  },
}));

beforeEach(() => {
  lockControl.locks.length = 0;
  lockControl.waiters.length = 0;
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function latch(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function locksCreated(count: number): Promise<void> {
  if (lockControl.locks.length >= count) return Promise.resolve();
  return new Promise((resolve) => { lockControl.waiters.push({ count, resolve }); });
}

function childLock(call: number): (typeof lockControl.locks)[number] {
  const found = lockControl.locks.find(({ directory }) => directory.endsWith(`/subflows/${String(call)}`));
  if (found === undefined) throw new Error(`No lock exists for child ${String(call)}.`);
  return found;
}

test("an unstarted nested call names its caller fault instead of an outside signal", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-stopped-subflow-"));
  roots.push(root);
  const runs = join(root, "runs");
  await mkdir(runs);
  const clock = createAgentClock(manualClock());
  const first = runStartEvent({
    ts: clock.timestamp(), run: "parent", assembly: "test", assemblyHash: "a".repeat(64), flow: "main",
    request: { path: "request.txt", sha256: hashBytes("request"), bytes: 7, via: "stdin" },
  });
  const created = await createRecordWriter(runs, first);
  if (created.status !== "created") throw new Error("The parent record collided.");
  const child = flow("child", "subflows/child", [stage("subflows/child/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  const caller = new AbortController();
  caller.abort();
  const result = await runSubflowBatch({
    calls: [{ flow: "child", input: "work" }], scope: new Map([["child", child]]), currentFlow: main,
    currentDepth: 1, currentCallChainDepth: 0, identity: { stage: "01-parent", retry: 1 }, writer: created.writer,
    answersDirectory: join(root, "answers"), scratchDirectory: join(root, "scratch"),
    metadata: { assembly: "test", assemblyHash: "a".repeat(64), installationId: "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8" }, slots: {}, workdirRoot: root,
    clock, monotonic: () => clock.milliseconds(), signal: createRunSignal(clock), toolSignal: caller.signal,
    callerStop: { failure: () => ({ reason: new Error("parent child lock was compromised") }) }, counter: { value: 0 },
    runChild: () => Promise.reject(new Error("An unstarted child must not run.")),
  });
  expect(result).toEqual([expect.objectContaining({
    started: false, reason: "The calling subflow stopped: parent child lock was compromised",
  })]);
});

test("an outside signal admitted before child publication replaces a concurrent local fault", async () => {
  const promptStarted = latch();
  const promptNeverSettles = latch();
  const stageEnding = latch();
  const releaseStageEnding = latch();
  const broken = flow("broken", "subflows/broken", [stage("subflows/broken/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  const scripts = new Map<string, Script>([
    ["broken:01-answer:1", (context) => {
      const append = context.writer.append.bind(context.writer);
      context.writer.append = async (event) => {
        if (event.event === "stage_end") {
          stageEnding.resolve();
          await releaseStageEnding.promise;
        }
        await append(event);
      };
      return [async () => {
        promptStarted.resolve();
        await promptNeverSettles.promise;
        return fauxAssistantMessage("late answer");
      }];
    }],
    ["main:01-parent:1", () => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "broken", input: "break" }] })], { stopReason: "toolUse" }),
      fauxAssistantMessage("not reached"),
    ]],
  ]);
  const run = await start(main, assembly(main, new Map([["broken", broken]])), scripts, { clock: manualClock() });
  await locksCreated(1);
  await promptStarted.promise;
  childLock(1).fail(new Error("child run lock was compromised"));
  await bounded(stageEnding.promise, "child stage ending before signal");
  run.signal.activate("SIGTERM");
  releaseStageEnding.resolve();

  await expect(bounded(run.result, "outside signal before child publication")).resolves.toMatchObject({ exit: 143, cause: "signal" });
  const childPath = join(run.writer.writer.runDirectory, "stages/01-parent/1/1/subflows/1/record.jsonl");
  const childRecord = await events(childPath);
  expect(childRecord.filter((event) => event["event"] === "signal")).toHaveLength(1);
  expect(childRecord.filter((event) => event["event"] === "run_end")).toEqual([
    expect.objectContaining({ exit: 143, cause: "signal" }),
  ]);
});

test("a local child fault remains primary after its terminal-publication boundary", async () => {
  const promptStarted = latch();
  const promptNeverSettles = latch();
  const parentReceived = latch();
  const releaseParent = latch();
  const broken = flow("broken", "subflows/broken", [stage("subflows/broken/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  const scripts = new Map<string, Script>([
    ["broken:01-answer:1", () => [async () => {
      promptStarted.resolve();
      await promptNeverSettles.promise;
      return fauxAssistantMessage("late answer");
    }]],
    ["main:01-parent:1", () => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "broken", input: "break" }] })], { stopReason: "toolUse" }),
      async () => {
        parentReceived.resolve();
        await releaseParent.promise;
        return fauxAssistantMessage("done");
      },
    ]],
  ]);
  const run = await start(main, assembly(main, new Map([["broken", broken]])), scripts, { clock: manualClock() });
  await locksCreated(1);
  await promptStarted.promise;
  childLock(1).fail(new Error("child run lock was compromised"));
  await bounded(parentReceived.promise, "parent receives the child outcome");
  const childPath = join(run.writer.writer.runDirectory, "stages/01-parent/1/1/subflows/1/record.jsonl");
  const beforeSignal = await readFile(childPath);
  expect((await events(childPath)).filter((event) => event["event"] === "run_end")).toEqual([
    expect.objectContaining({ exit: 2, cause: "fault", reason: "child run lock was compromised" }),
  ]);

  run.signal.activate("SIGTERM");
  releaseParent.resolve();
  await expect(bounded(run.result, "outside signal after child publication")).resolves.toMatchObject({ exit: 143, cause: "signal" });
  expect(await readFile(childPath)).toEqual(beforeSignal);
  expect((await events(childPath)).filter((event) => event["event"] === "signal")).toEqual([]);
});
