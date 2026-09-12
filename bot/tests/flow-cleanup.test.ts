import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { afterEach, expect, test } from "vitest";
import type { Flow } from "../src/model.ts";
import { heldRecord } from "../src/record-lines.ts";
import { createRunSignal } from "../src/signal.ts";
import { temporaryHandle } from "../src/invocation.ts";
import { outputOf } from "./hostile.ts";
import { assembly, clock, events, flow, roots, stage, start, writes, type Script } from "./flow-harness.ts";
import { controlledGroups, delegates, expectLockFault, latch, machinery } from "./terminal-test-helpers.ts";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("the root removes processes and shared temporary data before run_end", async () => {
  const held = latch();
  const cleanupStarted = latch();
  const groups = controlledGroups([() => { cleanupStarted.resolve(); return held.promise; }]);
  const signal = createRunSignal(clock, undefined, groups);
  const ordinary = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const main = { ...ordinary, tmp: "flow" as const };
  let shared = "";
  let cleanupFinished = false;
  const run = await start(main, assembly(main), new Map([["main:01-work:1", (context) => [async () => {
    shared = context.tmpPath;
    await writeFile(outputOf(context), "done");
    return fauxAssistantMessage("done");
  }]]]), {
    signal,
    wrapWriter: (writer) => delegates(writer, async (event) => {
      if (event.event === "run_end") {
        await expect(readdir(shared)).rejects.toThrow();
        cleanupFinished = true;
      }
      await writer.append(event);
    }),
  });

  await cleanupStarted.promise;
  expect((await events(run.writer.writer.recordPath)).some((event) => event["event"] === "run_end")).toBe(false);
  held.resolve();
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  expect(cleanupFinished).toBe(true);
  expect(groups.calls).toBe(1);
  expect((await events(run.writer.writer.recordPath)).at(-1)).toMatchObject({ event: "run_end" });
});

test("a child seals while its sibling runs and only the outer run sweeps all groups", async () => {
  const second = latch();
  const secondStarted = latch();
  const groups = controlledGroups([() => Promise.resolve()]);
  const signal = createRunSignal(clock, undefined, groups);
  const fast = flow("fast", "subflows/fast", [stage("subflows/fast/01-answer.md", "answer")]);
  const slow = flow("slow", "subflows/slow", [stage("subflows/slow/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  const scripts = new Map<string, Script>([
    ["fast:01-answer:1", writes("fast")],
    ["slow:01-answer:1", (context) => [async () => {
      secondStarted.resolve();
      await second.promise;
      await writeFile(outputOf(context), "slow");
      return fauxAssistantMessage("done");
    }]],
    ["main:01-parent:1", (context) => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [
        { flow: "fast", input: "first" }, { flow: "slow", input: "second" },
      ] })], { stopReason: "toolUse" }),
      async () => { await writeFile(outputOf(context), "parent"); return fauxAssistantMessage("done"); },
    ]],
  ]);
  const children = new Map<string, Flow>([["fast", fast], ["slow", slow]]);
  const run = await start(main, assembly(main, children), scripts, { signal });
  await secondStarted.promise;
  let sealed;
  try {
    const deadline = Date.now() + 2_000;
    do {
      sealed = await heldRecord(run.writer.writer.runDirectory, "stages/01-parent/1/1/subflows/1/record.jsonl");
      if (sealed?.classification === "valid") break;
      await new Promise<void>((resolve) => { setTimeout(resolve, 10); });
    } while (Date.now() < deadline);
    expect(sealed?.events.at(-1)).toMatchObject({ event: "run_end", cause: "success" });
    expect(groups.calls).toBe(0);
  } finally {
    second.resolve();
    await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  }
  expect(groups.calls).toBeGreaterThan(0);
});

test("a signal received during final process cleanup wins before run_end", async () => {
  const rootCleanup = latch();
  const signalCleanup = latch();
  const cleanupStarted = latch();
  const signalCleanupStarted = latch();
  const groups = controlledGroups([
    () => { cleanupStarted.resolve(); return rootCleanup.promise; },
    () => { signalCleanupStarted.resolve(); return signalCleanup.promise; },
  ]);
  const signal = createRunSignal(clock, undefined, groups);
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("done")]]), { signal });
  await cleanupStarted.promise;
  signal.activate("SIGTERM");
  rootCleanup.resolve();
  await signalCleanupStarted.promise;
  expect((await events(run.writer.writer.recordPath)).some((event) => event["event"] === "run_end")).toBe(false);
  signalCleanup.resolve();
  await expect(run.result).resolves.toMatchObject({ exit: 143, cause: "signal" });
  const record = await events(run.writer.writer.recordPath);
  expect(record.slice(-2).map((event) => event["event"])).toEqual(["signal", "run_end"]);
});

test("a signal received during shared temporary cleanup wins before run_end", async () => {
  const signalCleanup = latch();
  const signalCleanupStarted = latch();
  const groups = controlledGroups([
    () => Promise.resolve(),
    () => { signalCleanupStarted.resolve(); return signalCleanup.promise; },
  ]);
  const signal = createRunSignal(clock, undefined, groups);
  const ordinary = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const main = { ...ordinary, tmp: "flow" as const };
  let activated = false;
  let handle = "";
  const run = await start(main, assembly(main), new Map([["main:01-work:1", (context) => [async () => {
    handle = temporaryHandle(context.tmpPath);
    await rm(handle, { force: true });
    await writeFile(handle, "collision");
    await writeFile(outputOf(context), "done");
    return fauxAssistantMessage("done");
  }]]]), {
    signal,
    wrapWriter: (writer) => delegates(writer, async (event) => {
      if (event.event === "tmp_teardown" && !activated) {
        activated = true;
        signal.activate("SIGINT");
      }
      await writer.append(event);
    }),
  });
  try {
    await signalCleanupStarted.promise;
    expect((await events(run.writer.writer.recordPath)).some((event) => event["event"] === "run_end")).toBe(false);
    signalCleanup.resolve();
    await expect(run.result).resolves.toMatchObject({ exit: 130, cause: "signal" });
    const record = await events(run.writer.writer.recordPath);
    expect(record.map((event) => event["event"]).slice(-3)).toEqual(["tmp_teardown", "signal", "run_end"]);
    expect(groups.calls).toBe(2);
  } finally {
    if (handle !== "") await rm(handle, { force: true });
  }
});

test("a signal admitted immediately before the close boundary controls run_end", async () => {
  const groups = controlledGroups([() => Promise.resolve()]);
  const base = createRunSignal(clock, undefined, groups);
  const signal = { ...base, close: () => { base.activate("SIGTERM"); return base.close(); } };
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("done")]]), { signal });
  await expect(run.result).resolves.toMatchObject({ exit: 143, cause: "signal" });
  expect((await events(run.writer.writer.recordPath)).slice(-2).map((event) => event["event"]))
    .toEqual(["signal", "run_end"]);
});

test("a signal received immediately after the close boundary cannot change the ending", async () => {
  const groups = controlledGroups([() => Promise.resolve()]);
  const base = createRunSignal(clock, undefined, groups);
  const signal = { ...base, close: async () => {
    const snapshot = await base.close();
    base.activate("SIGTERM");
    return snapshot;
  } };
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("done")]]), { signal });
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  const record = await events(run.writer.writer.recordPath);
  expect(record.some((event) => event["event"] === "signal")).toBe(false);
  expect(groups.calls).toBe(1);
  expect(record.at(-1)).toMatchObject({ event: "run_end", exit: 0, cause: "success" });
});

test("a root lock compromise during output reading controls terminal publication", async () => {
  const outputStarted = latch();
  const releaseOutput = latch();
  const lock = machinery();
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("done")]]), {
    compromised: lock.compromised,
    machineryStop: lock.stop,
    readOutput: async () => { outputStarted.resolve(); await releaseOutput.promise; return Buffer.from("done"); },
  });
  await outputStarted.promise;
  lock.fail(new Error("root lock compromised"));
  releaseOutput.resolve();
  await expectLockFault(run.result);
  expect((await events(run.writer.writer.recordPath)).at(-1)).toMatchObject({ event: "run_end", exit: 2, cause: "fault" });
});

test("a root lock compromise during process cleanup controls terminal publication", async () => {
  const cleanupStarted = latch();
  const releaseCleanup = latch();
  const groups = controlledGroups([() => { cleanupStarted.resolve(); return releaseCleanup.promise; }]);
  const signal = createRunSignal(clock, undefined, groups);
  const lock = machinery();
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("done")]]), {
    signal, compromised: lock.compromised, machineryStop: lock.stop,
  });
  await cleanupStarted.promise;
  lock.fail(new Error("root lock compromised"));
  releaseCleanup.resolve();
  await expectLockFault(run.result);
});

test("a root lock compromise during shared cleanup controls terminal publication", async () => {
  const lock = machinery();
  const ordinary = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const main = { ...ordinary, tmp: "flow" as const };
  let handle = "";
  const run = await start(main, assembly(main), new Map([["main:01-work:1", (context) => [async () => {
    handle = temporaryHandle(context.tmpPath);
    await rm(handle, { force: true });
    await writeFile(handle, "collision");
    await writeFile(outputOf(context), "done");
    return fauxAssistantMessage("done");
  }]]]), {
    compromised: lock.compromised,
    machineryStop: lock.stop,
    wrapWriter: (writer) => delegates(writer, async (event) => {
      if (event.event === "tmp_teardown") lock.fail(new Error("root lock compromised"));
      await writer.append(event);
    }),
  });
  try {
    await expectLockFault(run.result);
  } finally {
    if (handle !== "") await rm(handle, { force: true });
  }
});

test("a root lock compromise admitted while signal closure is held controls run_end", async () => {
  const closeStarted = latch();
  const releaseClose = latch();
  const base = createRunSignal(clock, undefined, controlledGroups([() => Promise.resolve()]));
  const signal = { ...base, close: async (closeAdmission?: () => void) => {
    closeStarted.resolve();
    await releaseClose.promise;
    return base.close(closeAdmission);
  } };
  const lock = machinery();
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("done")]]), {
    signal, compromised: lock.compromised, machineryStop: lock.stop,
  });
  await closeStarted.promise;
  lock.fail(new Error("root lock compromised"));
  await Promise.resolve();
  releaseClose.resolve();
  await expectLockFault(run.result);
});

test("a compromise after terminal admission closes cannot overtake a held run_end append", async () => {
  const ending = latch();
  const releaseEnding = latch();
  const lock = machinery();
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("done")]]), {
    compromised: lock.compromised,
    machineryStop: lock.stop,
    wrapWriter: (writer) => delegates(writer, async (event) => {
      if (event.event === "run_end") {
        ending.resolve();
        await releaseEnding.promise;
      }
      await writer.append(event);
    }),
  });
  await ending.promise;
  lock.fail(new Error("too late"));
  expect((await events(run.writer.writer.recordPath)).some((event) => event["event"] === "run_end")).toBe(false);
  releaseEnding.resolve();
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
});

test("a queued signal cannot slip between the stable wait and terminal closure", async () => {
  const signalCleanup = latch();
  const signalAppend = latch();
  const groups = controlledGroups([() => Promise.resolve(), () => signalCleanup.promise]);
  const base = createRunSignal(clock, undefined, groups);
  const signal = { ...base, close: () => {
    const closing = base.close();
    queueMicrotask(() => { base.activate("SIGTERM"); });
    return closing;
  } };
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("done")]]), {
    signal,
    wrapWriter: (writer) => delegates(writer, async (event) => {
      if (event.event === "signal") await signalAppend.promise;
      await writer.append(event);
    }),
  });
  const result = await run.result;
  signalCleanup.resolve();
  signalAppend.resolve();
  await base.drain();
  expect(result).toMatchObject({ exit: 0, cause: "success" });
  expect(groups.calls).toBe(1);
  const record = await events(run.writer.writer.recordPath);
  expect(record.some((event) => event["event"] === "signal")).toBe(false);
  expect(record.at(-1)).toMatchObject({ event: "run_end", exit: 0, cause: "success" });
});

test("final cleanup failure becomes a matching fault record", async () => {
  const groups = controlledGroups([() => Promise.reject(new Error("group cleanup broke"))]);
  const signal = createRunSignal(clock, undefined, groups);
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("done")]]), { signal });
  const result = await run.result;
  expect(result).toMatchObject({ exit: 2, cause: "fault", reason: expect.stringContaining("group cleanup broke") as unknown });
  expect((await events(run.writer.writer.recordPath)).at(-1)).toMatchObject({
    event: "run_end", exit: 2, cause: "fault", reason: result.reason,
  });
  expect((await heldRecord(run.writer.writer.runDirectory))?.classification).toBe("valid");
});

test("a failed signal cleanup remains visible after a successful retry", async () => {
  const groups = controlledGroups([
    () => Promise.reject(new Error("first signal cleanup broke")),
    () => Promise.resolve(),
  ]);
  const signal = createRunSignal(clock, undefined, groups);
  signal.activate("SIGHUP");
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("unused")]]), { signal });
  const result = await run.result;
  expect(result).toMatchObject({
    exit: 129, cause: "signal", reason: expect.stringContaining("first signal cleanup broke") as unknown,
  });
  expect(groups.calls).toBeGreaterThan(1);
  expect((await events(run.writer.writer.recordPath)).at(-1)).toMatchObject({
    event: "run_end", exit: 129, cause: "signal", reason: result.reason,
  });
});

test("a writer failure stays primary when final cleanup also fails", async () => {
  const groups = controlledGroups([() => Promise.reject(new Error("secondary cleanup failure"))]);
  const signal = createRunSignal(clock, undefined, groups);
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", (context) => [async () => {
    await rm(context.writer.recordPath);
    await mkdir(context.writer.recordPath);
    await writeFile(outputOf(context), "done");
    return fauxAssistantMessage("done");
  }]]]), { signal });
  const result = await run.result;
  expect(result).toMatchObject({ exit: 2, cause: "fault" });
  expect(result.reason).toContain("EISDIR");
  expect(result.reason).not.toContain("secondary cleanup failure");
});

test("a writer failure during shared cleanup waits for signal cleanup and remains primary", async () => {
  const held = latch();
  const cleanupStarted = latch();
  const groups = controlledGroups([
    () => Promise.resolve(),
    () => { cleanupStarted.resolve(); return held.promise; },
  ]);
  const signal = createRunSignal(clock, undefined, groups);
  const ordinary = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const main = { ...ordinary, tmp: "flow" as const };
  let handle = "";
  const appended: string[] = [];
  const run = await start(main, assembly(main), new Map([["main:01-work:1", (context) => [async () => {
    handle = temporaryHandle(context.tmpPath);
    await rm(handle, { force: true });
    await writeFile(handle, "collision");
    await writeFile(outputOf(context), "done");
    return fauxAssistantMessage("done");
  }]]]), {
    signal,
    wrapWriter: (writer) => delegates(writer, async (event) => {
      appended.push(event.event);
      if (event.event === "tmp_teardown") {
        await rm(writer.recordPath);
        await mkdir(writer.recordPath);
        signal.activate("SIGTERM");
      }
      await writer.append(event);
    }),
  });
  let settled = false;
  void run.result.then(() => { settled = true; }, () => { settled = true; });
  try {
    await cleanupStarted.promise;
    expect(settled).toBe(false);
    expect(appended).not.toContain("run_end");
    held.resolve();
    const result = await run.result;
    expect(result).toMatchObject({ exit: 2, cause: "fault", reason: expect.stringContaining("EISDIR") as unknown });
    expect(appended).not.toContain("run_end");
  } finally {
    if (handle !== "") await rm(handle, { force: true });
  }
});

test("a throwing root path still attempts final cleanup and preserves the throw", async () => {
  const groups = controlledGroups([() => Promise.reject(new Error("secondary cleanup failure"))]);
  const base = createRunSignal(clock, undefined, groups);
  const primary = new Error("registration failed first");
  const signal = { ...base, register: (): (() => void) => { throw primary; } };
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("unused")]]), { signal });
  await expect(run.result).rejects.toBe(primary);
  expect(groups.calls).toBe(1);
  expect((await events(run.writer.writer.recordPath)).map((event) => event["event"])).toEqual(["run_start"]);
});
