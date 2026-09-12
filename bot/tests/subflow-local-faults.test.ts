import { fauxAssistantMessage, fauxToolCall, type ToolResultMessage } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, rm, watch, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Flow } from "../src/model.ts";
import { processGroupExists, type Executable, type ProcessGroups } from "../src/process.ts";
import { hashBytes } from "../src/record.ts";
import { createRunSignal } from "../src/signal.ts";
import type { SubflowToolDetail } from "../src/tools.ts";
import { bounded, outputOf } from "./hostile.ts";
import { assembly, events, flow, roots, stage, start, type Script } from "./flow-harness.ts";
import { manualClock } from "./manual-clock.ts";

const lockControl = vi.hoisted(() => ({
  locks: [] as { directory: string; fail: (reason: Error) => void; released: boolean }[],
  waiters: [] as { count: number; resolve: () => void }[],
}));

vi.mock("../src/run-lock.ts", () => ({
  lockActiveRun: (directory: string) => {
    let held: { directory: string; fail: (reason: Error) => void; released: boolean };
    const compromised = new Promise<never>((_resolve, reject) => {
      held = { directory, fail: (reason: Error) => { reject(reason); }, released: false };
      lockControl.locks.push(held);
      for (const waiter of lockControl.waiters) if (lockControl.locks.length >= waiter.count) waiter.resolve();
    });
    return { compromised, release: () => { held.released = true; } };
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

function childLock(call: number, depth = 1): (typeof lockControl.locks)[number] {
  const found = lockControl.locks.find(({ directory }) => directory.endsWith(`/subflows/${String(call)}`)
    && directory.split("/subflows/").length - 1 === depth);
  if (found === undefined) throw new Error(`No depth ${String(depth)} lock exists for child ${String(call)}.`);
  return found;
}

async function changed(changes: AsyncIterator<{ filename: string | null }>, name: string): Promise<void> {
  for (;;) {
    const change = await changes.next();
    if (change.done === true) throw new Error(`The file watcher ended before ${name} appeared.`);
    if (change.value.filename === name) return;
  }
}

function heldGroups(settlement: Promise<void>): ProcessGroups {
  return {
    reserve: () => Promise.resolve({}), track: () => undefined, publish: () => Promise.resolve(), settle: () => Promise.resolve(),
    terminate: () => settlement,
  };
}

async function executable(root: string, source: string): Promise<Executable> {
  const path = join(root, "gate.sh");
  await writeFile(path, source);
  await chmod(path, 0o755);
  return { path, file: "subflows/broken/01-answer/gate.sh", sha256: hashBytes(source) };
}

function children(): { main: Flow; scope: Map<string, Flow> } {
  const broken = flow("broken", "subflows/broken", [stage("subflows/broken/01-answer.md", "answer")]);
  const healthy = flow("healthy", "subflows/healthy", [stage("subflows/healthy/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  return { main, scope: new Map([["broken", broken], ["healthy", healthy]]) };
}

function toolResult(prompt: { messages: readonly { role: string }[] }): ToolResultMessage<SubflowToolDetail[]> {
  const result = prompt.messages.find((message) => message.role === "toolResult" && "toolName" in message && message.toolName === "subflow");
  if (result === undefined) throw new Error("The parent received no subflow result.");
  return result as ToolResultMessage<SubflowToolDetail[]>;
}

test("a child record-writer failure is an incomplete answer beside a healthy sibling", async () => {
  const childFailed = latch();
  const { main, scope } = children();
  let received: ToolResultMessage<SubflowToolDetail[]> | undefined;
  const scripts = new Map<string, Script>([
    ["broken:01-answer:1", (context) => [async () => {
      await rm(context.writer.recordPath);
      await mkdir(context.writer.recordPath);
      childFailed.resolve();
      return fauxAssistantMessage("done");
    }]],
    ["healthy:01-answer:1", (context) => [async () => {
      await childFailed.promise;
      await writeFile(outputOf(context), "healthy answer");
      return fauxAssistantMessage("done");
    }]],
    ["main:01-parent:1", (context) => [
      async () => {
        await writeFile(join(context.env["TMP"] ?? "", "break.txt"), "break");
        return fauxAssistantMessage("prepared file input");
      },
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [
        { flow: "broken", "input-file": "$TMP/break.txt" }, { flow: "healthy", input: "work" },
      ] })], { stopReason: "toolUse" }),
      async (prompt) => {
        received = toolResult(prompt);
        await writeFile(outputOf(context), "parent continued");
        return fauxAssistantMessage("done");
      },
    ]],
  ]);
  const run = await start(main, assembly(main, scope), scripts);
  const result = await run.result;
  expect(result.reason).toBeUndefined();
  expect(result).toMatchObject({ exit: 0, cause: "success" });
  expect(run.signal.exitCode()).toBeUndefined();
  const observed = received;
  if (observed === undefined) throw new Error("The parent did not receive the batch result.");
  const details = observed.details;
  if (details === undefined) throw new Error("The batch result carried no detail.");
  expect(details).toEqual([
    expect.objectContaining({ call: 1, flow: "broken", started: true, reason: expect.stringContaining("EISDIR") as unknown,
      input: expect.objectContaining({ path: "stages/01-parent/1/1/subflows/1/request.txt", sha256: hashBytes("break"), bytes: 5 }) as unknown }),
    expect.objectContaining({ call: 2, flow: "healthy", started: true, exit: 0, cause: "success" }),
  ]);
  expect(typeof details[0]?.child).toBe("string");
  expect(details[0]).not.toHaveProperty("exit");
  expect(details[0]).not.toHaveProperty("cause");
  const text = observed.content.map((part) => part.type === "text" ? part.text : "").join("");
  expect(text).toContain("child machinery failed");
  expect(text).toContain("record is incomplete");
  const record = await events(run.writer.writer.recordPath);
  expect(record.filter((event) => event["event"] === "signal")).toEqual([]);
  expect(record.filter((event) => event["event"] === "subflow_call")).toEqual([
    expect.objectContaining({ call: 1, started: true, reason: expect.stringContaining("EISDIR") as unknown,
      input: expect.objectContaining({ path: "stages/01-parent/1/1/subflows/1/request.txt", sha256: hashBytes("break"), bytes: 5 }) as unknown }),
    expect.objectContaining({ call: 2, started: true, exit: 0, cause: "success" }),
  ]);
  expect(typeof record.find((event) => event["event"] === "subflow_call" && event["call"] === 1)?.["child"]).toBe("string");
});

test("a lock fault queued during child publication reaches the child's terminal result", async () => {
  const publication = latch();
  const stageEnded = latch();
  const runEnding = latch();
  const releaseRunEnding = latch();
  const clock = manualClock();
  const signal = createRunSignal(clock, undefined, heldGroups(publication.promise));
  const broken = flow("broken", "subflows/broken", [stage("subflows/broken/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  let received: ToolResultMessage<SubflowToolDetail[]> | undefined;
  const scripts = new Map<string, Script>([
    ["broken:01-answer:1", (context) => {
      const append = context.writer.append.bind(context.writer);
      context.writer.append = async (event) => {
        if (event.event === "run_end") {
          runEnding.resolve();
          await releaseRunEnding.promise;
        }
        await append(event);
        if (event.event === "stage_end") stageEnded.resolve();
      };
      return [async () => {
        await writeFile(outputOf(context), "answer");
        return fauxAssistantMessage("done");
      }];
    }],
    ["main:01-parent:1", (context) => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "broken", input: "work" }] })], { stopReason: "toolUse" }),
      async (prompt) => {
        received = toolResult(prompt);
        await writeFile(outputOf(context), "parent continued");
        return fauxAssistantMessage("done");
      },
    ]],
  ]);
  const run = await start(main, assembly(main, new Map([["broken", broken]])), scripts, { clock, signal });
  const cleanup = signal.cleanup();
  await locksCreated(1);
  await stageEnded.promise;
  const childPath = join(run.writer.writer.runDirectory, "stages/01-parent/1/1/subflows/1/record.jsonl");
  expect((await events(childPath)).filter((event) => event["event"] === "run_end")).toEqual([]);

  childLock(1).fail(new Error("child run lock was compromised during publication"));
  queueMicrotask(publication.resolve);
  await cleanup;
  await runEnding.promise;
  const heldLock = childLock(1);
  expect(heldLock.released).toBe(false);
  expect((await events(childPath)).filter((event) => event["event"] === "run_end")).toEqual([]);
  releaseRunEnding.resolve();
  await expect(bounded(run.result, "queued child lock compromise")).resolves.toMatchObject({ exit: 0, cause: "success" });
  expect(heldLock.released).toBe(true);
  expect((await events(childPath)).filter((event) => event["event"] === "run_end")).toEqual([
    expect.objectContaining({ exit: 2, cause: "fault", reason: "child run lock was compromised during publication" }),
  ]);
  expect(received?.details).toEqual([
    expect.objectContaining({ started: true, exit: 2, cause: "fault", reason: "child run lock was compromised during publication" }),
  ]);
});

test("a child lock compromise settles its losing stage before publishing beside a healthy sibling", async () => {
  const promptStarted = latch();
  const promptNeverSettles = latch();
  const stageEnding = latch();
  const releaseStageEnding = latch();
  const compromiseStarted = latch();
  const { main, scope } = children();
  let received: ToolResultMessage<SubflowToolDetail[]> | undefined;
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
    ["healthy:01-answer:1", (context) => [async () => {
      await compromiseStarted.promise;
      await writeFile(outputOf(context), "healthy answer");
      return fauxAssistantMessage("done");
    }]],
    ["main:01-parent:1", (context) => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [
        { flow: "broken", input: "break" }, { flow: "healthy", input: "work" },
      ] })], { stopReason: "toolUse" }),
      async (prompt) => {
        received = toolResult(prompt);
        await writeFile(outputOf(context), "parent continued");
        return fauxAssistantMessage("done");
      },
    ]],
  ]);
  const run = await start(main, assembly(main, scope), scripts, { clock: manualClock() });
  await locksCreated(2);
  await promptStarted.promise;
  childLock(1).fail(new Error("child run lock was compromised"));
  compromiseStarted.resolve();
  await bounded(stageEnding.promise, "child stage ending");

  const childPath = join(run.writer.writer.runDirectory, "stages/01-parent/1/1/subflows/1/record.jsonl");
  expect((await events(childPath)).filter((event) => event["event"] === "run_end")).toEqual([]);
  expect((await events(run.writer.writer.recordPath)).filter((event) => event["event"] === "subflow_call")).toEqual([]);

  releaseStageEnding.resolve();
  await expect(bounded(run.result, "local child lock compromise")).resolves.toMatchObject({ exit: 0, cause: "success" });
  expect(run.signal.exitCode()).toBeUndefined();
  const childRecord = await events(childPath);
  expect(childRecord.filter((event) => event["event"] === "run_end")).toEqual([
    expect.objectContaining({ exit: 2, cause: "fault", reason: "child run lock was compromised" }),
  ]);
  expect(childRecord.filter((event) => event["event"] === "signal")).toEqual([]);
  const details = received?.details;
  expect(details).toEqual([
    expect.objectContaining({ call: 1, started: true, exit: 2, cause: "fault", reason: "child run lock was compromised" }),
    expect.objectContaining({ call: 2, started: true, exit: 0, cause: "success" }),
  ]);
  expect((await events(run.writer.writer.recordPath)).filter((event) => event["event"] === "signal")).toEqual([]);
  expect(await readFile(childPath)).not.toHaveLength(0);
});

test("a child lock compromise waits for its active command barrier while a sibling succeeds", async () => {
  const gateRoot = await mkdtemp(join(tmpdir(), "bot-child-gate-"));
  roots.push(gateRoot);
  const marker = join(gateRoot, "started");
  const stopped = join(gateRoot, "stopped");
  const source = `#!/bin/sh\ntrap \"printf 'stopped\\\\n' > '${stopped}'; while :; do :; done\" TERM\nprintf '%s\\n' \"$$\" > '${marker}'\nwhile :; do :; done\n`;
  const gate = await executable(gateRoot, source);
  const changes = watch(gateRoot)[Symbol.asyncIterator]();
  const started = changed(changes, "started");
  const compromised = latch();
  const clock = manualClock();
  const { main, scope } = children();
  let received: ToolResultMessage<SubflowToolDetail[]> | undefined;
  const scripts = new Map<string, Script>([
    ["broken:01-answer:1", (context) => [async () => {
      await writeFile(outputOf(context), "candidate");
      return fauxAssistantMessage("done");
    }]],
    ["healthy:01-answer:1", (context) => [async () => {
      await compromised.promise;
      await writeFile(outputOf(context), "healthy answer");
      return fauxAssistantMessage("done");
    }]],
    ["main:01-parent:1", (context) => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [
        { flow: "broken", input: "break" }, { flow: "healthy", input: "work" },
      ] })], { stopReason: "toolUse" }),
      async (prompt) => {
        received = toolResult(prompt);
        await writeFile(outputOf(context), "parent continued");
        return fauxAssistantMessage("done");
      },
    ]],
  ]);
  const run = await start(main, assembly(main, scope), scripts, {
    clock,
    gates: new Map([["broken:01-answer:1", [gate]]]),
  });
  await bounded(started, "gate started marker");
  const pid = Number((await readFile(marker, "utf8")).trim());
  try {
    await locksCreated(2);
    const commandStopped = changed(changes, "stopped");
    childLock(1).fail(new Error("child run lock was compromised"));
    compromised.resolve();
    const childPath = join(run.writer.writer.runDirectory, "stages/01-parent/1/1/subflows/1/record.jsonl");
    await bounded(commandStopped, "gate stopped marker");
    expect((await events(childPath)).filter((event) => event["event"] === "run_end")).toEqual([]);
    expect((await events(run.writer.writer.recordPath)).filter((event) => event["event"] === "subflow_call")).toEqual([]);

    clock.advance(250);
    await expect(bounded(run.result, "child active command barrier")).resolves.toMatchObject({ exit: 0, cause: "success" });
    expect(processGroupExists(pid)).toBe(false);
    expect(run.signal.exitCode()).toBeUndefined();
    expect((await events(childPath)).filter((event) => event["event"] === "run_end")).toEqual([
      expect.objectContaining({ exit: 2, cause: "fault", reason: "child run lock was compromised" }),
    ]);
    expect(received?.details).toEqual([
      expect.objectContaining({ call: 1, started: true, exit: 2, cause: "fault", reason: "child run lock was compromised" }),
      expect.objectContaining({ call: 2, started: true, exit: 0, cause: "success" }),
    ]);
  } finally {
    await changes.return?.();
    if (processGroupExists(pid)) process.kill(-pid, "SIGKILL");
  }
});

test("a locally faulted child settles its running grandchild before either parent publishes", async () => {
  const grandchildStarted = latch();
  const grandchildNeverSettles = latch();
  const grandchildEnding = latch();
  const releaseGrandchildEnding = latch();
  const healthyMayFinish = latch();
  const grandchild = flow("grandchild", "subflows/grandchild", [stage("subflows/grandchild/01-answer.md", "answer")]);
  const nested = flow("nested", "subflows/nested", [stage("subflows/nested/01-parent.md", "parent")]);
  const healthy = flow("healthy", "subflows/healthy", [stage("subflows/healthy/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  let received: ToolResultMessage<SubflowToolDetail[]> | undefined;
  const scripts = new Map<string, Script>([
    ["grandchild:01-answer:1", (context) => {
      const append = context.writer.append.bind(context.writer);
      context.writer.append = async (event) => {
        if (event.event === "stage_end") {
          grandchildEnding.resolve();
          await releaseGrandchildEnding.promise;
        }
        await append(event);
      };
      return [async () => {
        grandchildStarted.resolve();
        await grandchildNeverSettles.promise;
        return fauxAssistantMessage("late grandchild answer");
      }];
    }],
    ["nested:01-parent:1", () => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "grandchild", input: "nested work" }] })], { stopReason: "toolUse" }),
      fauxAssistantMessage("not reached"),
    ]],
    ["healthy:01-answer:1", (context) => [async () => {
      await healthyMayFinish.promise;
      await writeFile(outputOf(context), "healthy answer");
      return fauxAssistantMessage("done");
    }]],
    ["main:01-parent:1", (context) => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [
        { flow: "nested", input: "break" }, { flow: "healthy", input: "work" },
      ] })], { stopReason: "toolUse" }),
      async (prompt) => {
        received = toolResult(prompt);
        await writeFile(outputOf(context), "parent continued");
        return fauxAssistantMessage("done");
      },
    ]],
  ]);
  const scope = new Map([["nested", nested], ["healthy", healthy], ["grandchild", grandchild]]);
  const run = await start(main, assembly(main, scope), scripts, { clock: manualClock() });
  await locksCreated(3);
  await grandchildStarted.promise;
  childLock(1).fail(new Error("parent child lock was compromised"));
  healthyMayFinish.resolve();
  await bounded(grandchildEnding.promise, "grandchild ending after caller abort");
  const nestedPath = join(run.writer.writer.runDirectory, "stages/01-parent/1/1/subflows/1");
  const grandchildPath = join(nestedPath, "stages/01-parent/1/1/subflows/1/record.jsonl");
  expect((await events(join(nestedPath, "record.jsonl"))).filter((event) => event["event"] === "run_end")).toEqual([]);
  expect((await events(run.writer.writer.recordPath)).filter((event) => event["event"] === "subflow_call")).toEqual([]);

  releaseGrandchildEnding.resolve();
  await expect(bounded(run.result, "nested child local fault")).resolves.toMatchObject({ exit: 0, cause: "success" });
  expect((await events(grandchildPath)).filter((event) => event["event"] === "run_end")).toEqual([
    expect.objectContaining({ exit: 2, cause: "fault", reason: "parent child lock was compromised" }),
  ]);
  expect((await events(join(nestedPath, "record.jsonl"))).filter((event) => event["event"] === "run_end")).toEqual([
    expect.objectContaining({ exit: 2, cause: "fault", reason: "parent child lock was compromised" }),
  ]);
  expect(received?.details).toEqual([
    expect.objectContaining({ call: 1, started: true, exit: 2, cause: "fault", reason: "parent child lock was compromised" }),
    expect.objectContaining({ call: 2, started: true, exit: 0, cause: "success" }),
  ]);
  expect(run.signal.exitCode()).toBeUndefined();
});
