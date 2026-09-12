// Ticket 0017 — hostile-provider sweep over the gating loop (stage, loop,
// choose modes). Every test asserts the invariant triple: bounded (the manual
// clock is the only time source; a would-hang path fails fast), record
// consistent (stage_end exactly once, absence means it never happened), exit
// honest (0/1/2 with the spec's cause words).
import { Type, fauxAssistantMessage, fauxToolCall, type AssistantMessage } from "@earendil-works/pi-ai";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createMemoryHarness, type HarnessTool } from "../src/harness.ts";
import { runGating, type GatingConfig, type GatingInput } from "../src/gating.ts";
import { nextAttempt } from "../src/attempt.ts";
import { runStartEvent } from "../src/record-events.ts";
import { createRecordWriter } from "../src/record.ts";
import { createControlContext, createControlTools, type ControlContext } from "../src/tools.ts";
import { bounded, hostileModels, waitFor, type HostileHandle, type HostileStep } from "./hostile.ts";
import { manualClock } from "./manual-clock.ts";

const cleanups: Array<() => Promise<void>> = [];
let runNumber = 0;

interface OwnedProvider { invocation: number; release?: () => void; settle: boolean }
interface OwnedTool { started: Promise<void>; settled: Promise<void>; release: () => void }

async function initiateTermination(
  runSettled: boolean,
  running: ReturnType<typeof runGating> | undefined,
  clock: ReturnType<typeof manualClock>,
  harness: { abort(): Promise<unknown> },
): Promise<void> {
  if (runSettled || running === undefined) return;
  if (clock.pending() > 0) clock.fire();
  else await harness.abort();
}

async function settleProvider(
  running: ReturnType<typeof runGating> | undefined,
  hostile: HostileHandle,
  provider: OwnedProvider,
  runIsSettled: () => boolean,
  terminate: () => Promise<void>,
): Promise<boolean> {
  if (provider.settle && hostile.lifecycle.last(provider.invocation) === "stream settled") return false;
  if (hostile.lifecycle.last(provider.invocation) === "not started") {
    if (runIsSettled()) return true;
    await hostile.lifecycle.await(provider.invocation, "stream started", "cleanup provider start");
  }
  const terminated = !runIsSettled();
  if (terminated) await terminate();
  provider.release?.();
  if (terminated && running !== undefined) await running;
  if (provider.settle) await hostile.lifecycle.await(provider.invocation, "stream settled", "cleanup provider settlement");
  return runIsSettled();
}

async function settleProviders(
  running: ReturnType<typeof runGating> | undefined,
  hostile: HostileHandle,
  providers: OwnedProvider[],
  runIsSettled: () => boolean,
  terminate: () => Promise<void>,
): Promise<void> {
  for (const provider of [...providers].sort((left, right) => left.invocation - right.invocation)) {
    if (await settleProvider(running, hostile, provider, runIsSettled, terminate)) return;
  }
}

async function releaseTools(tools: OwnedTool[]): Promise<void> {
  for (const tool of tools) {
    await bounded(tool.started, "cleanup tool start");
    tool.release();
  }
}

async function awaitSettlement(
  running: ReturnType<typeof runGating> | undefined,
  tools: OwnedTool[],
  harness: { waitForIdle(): Promise<void> },
  skipIdle: boolean,
): Promise<void> {
  if (running !== undefined) await running;
  for (const tool of tools) await bounded(tool.settled, "cleanup tool settlement");
  if (!skipIdle) await harness.waitForIdle();
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture(
  script: HostileStep[],
  tools: HarnessTool<ControlContext>[] = createControlTools(),
  beforeController?: ReturnType<typeof latch>,
) {
  const clock = manualClock();
  const root = await mkdtemp(join(tmpdir(), "bot-hostile-gating-"));
  const runs = join(root, "runs");
  const input = join(root, "input");
  const output = join(root, "output.txt");
  await Promise.all([mkdir(runs), mkdir(input)]);
  const created = await createRecordWriter(runs, runStartEvent({
    ts: clock.timestamp(),
    run: `2026-08-01T09-00-${String(runNumber++).padStart(2, "0")}-dead`,
    assembly: "hostile",
    assemblyHash: "a".repeat(64),
    flow: "main",
    request: { path: "request.txt", sha256: "b".repeat(64), bytes: 1, via: "stdin" },
  }));
  if (created.status !== "created") throw new Error("temporary record name collided");
  const hostile = hostileModels(script);
  const controls = createControlContext();
  const harness = createMemoryHarness({
    models: hostile.models,
    model: hostile.model,
    systemPrompt: "Hostile gating sweep.",
    tools,
    context: controls,
  });
  if (beforeController !== undefined) harness.beforeAgentStart(async () => {
    await beforeController.promise;
    return undefined;
  });
  const common = {
    timeoutMs: 5_000, retries: 1, cwd: root,
    env: { ...process.env, INPUT: input, OUTPUT: output, TMP: root, PWD: root },
    session: "stages/01-work/1/session.jsonl", received: [], options: [],
  };
  let running: ReturnType<typeof runGating> | undefined;
  let runSettled = false;
  let cleaning: Promise<void> | undefined;
  let skipIdle = false;
  const providers: OwnedProvider[] = [];
  const toolsOwned: OwnedTool[] = [];
  const cleanup = (): Promise<void> => {
    cleaning ??= (async () => {
      beforeController?.release();
      await settleProviders(
        running,
        hostile,
        providers,
        () => runSettled,
        async () => { await initiateTermination(runSettled, running, clock, harness); },
      );
      await initiateTermination(runSettled, running, clock, harness);
      await releaseTools(toolsOwned);
      await awaitSettlement(running, toolsOwned, harness, skipIdle);
      await created.writer.drain();
      await rm(root, { recursive: true, force: true });
    })();
    return cleaning;
  };
  cleanups.push(cleanup);
  return {
    root, output, clock, writer: created.writer, harness, hostile, controls, common, cleanup,
    trackRun(runPromise: ReturnType<typeof runGating>) {
      running = runPromise;
      void runPromise.then(() => { runSettled = true; }, () => { runSettled = true; });
    },
    ownProvider(invocation: number, release?: () => void) {
      providers.push({ invocation, settle: true, ...(release === undefined ? {} : { release }) });
    },
    abandonProvider(invocation: number) { providers.push({ invocation, settle: false }); skipIdle = true; },
    ownTool(tool: OwnedTool) { toolsOwned.push(tool); },
  };
}

function latch() {
  let release = (): void => undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

async function events(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function run(f: Fixture, config: GatingConfig) {
  const input: GatingInput = {
    harness: f.harness, controls: f.controls, writer: f.writer,
    identity: { stage: "01-work", retry: 1 }, clock: f.clock, config, close: () => f.harness.close(),
  };
  const running = runGating(input);
  f.trackRun(running);
  return running;
}

function stageConfig(f: Fixture): GatingConfig {
  return { ...f.common, mode: "stage", outputPath: f.output, outputExtension: "txt" };
}

/** The record shows exactly one ending and claims no more attempts than started. */
function consistent(record: Record<string, unknown>[], starts: number): Record<string, unknown> {
  const ends = record.filter((event) => event["event"] === "stage_end");
  expect(ends).toHaveLength(1);
  expect(record.filter((event) => event["event"] === "stage_start")).toHaveLength(starts);
  const end = ends[0];
  if (end === undefined) throw new Error("unreachable");
  return end;
}

test("a quota provider error on the first attempt is one fault, not a retry", async () => {
  const f = await fixture([fauxAssistantMessage("", { stopReason: "error", errorMessage: "quota exceeded" })]);
  const result = await bounded(run(f, stageConfig(f)), "error-first");
  expect(result).toMatchObject({ exit: 2, cause: "fault", reason: "quota exceeded" });
  const record = await events(f.writer.recordPath);
  const end = consistent(record, 1);
  expect(record.filter((event) => event["event"] === "provider_retry")).toHaveLength(0);
  expect(end).toMatchObject({ exit: 2, cause: "fault" });
  expect(end["output"]).toBeUndefined();
});

test("a provider error on the retry attempt faults with the retry's identity", async () => {
  const f = await fixture([
    fauxAssistantMessage("no output written"),
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "storm continues" }),
  ]);
  const result = await bounded(run(f, stageConfig(f)), "error-nth");
  expect(result).toMatchObject({ exit: 2, cause: "fault", reason: "storm continues" });
  const end = consistent(await events(f.writer.recordPath), 2);
  expect(end).toMatchObject({ exit: 2, cause: "fault", retry: 2 });
});

test("empty responses exhaust the configured retries honestly", async () => {
  const f = await fixture([fauxAssistantMessage([]), fauxAssistantMessage([])]);
  const result = await bounded(run(f, stageConfig(f)), "empty-responses");
  expect(result).toMatchObject({ exit: 1, cause: "exhausted" });
  const record = await events(f.writer.recordPath);
  const end = consistent(record, 2);
  expect(end).toMatchObject({ exit: 1, cause: "exhausted" });
  expect(record.filter((event) => event["check"] === "output")).toHaveLength(2);
});

test("a mark call with malformed arguments feeds back instead of faulting the stage", async () => {
  let output = "";
  const f = await fixture([
    fauxAssistantMessage([fauxToolCall("mark", { item: "one", state: 5 })], { stopReason: "toolUse" }),
    async () => { await writeFile(output, "recovered"); return fauxAssistantMessage("done"); },
  ]);
  output = f.output;
  const result = await bounded(run(f, stageConfig(f)), "malformed-mark");
  expect(result).toMatchObject({ exit: 0, cause: "success" });
  const record = await events(f.writer.recordPath);
  consistent(record, 1);
  expect(record.filter((event) => event["event"] === "tool_call")).toHaveLength(0);
});

test("a tool call naming an unknown tool feeds back instead of faulting the stage", async () => {
  let output = "";
  const f = await fixture([
    fauxAssistantMessage([fauxToolCall("frobnicate", { level: 11 })], { stopReason: "toolUse" }),
    async () => { await writeFile(output, "recovered"); return fauxAssistantMessage("done"); },
  ]);
  output = f.output;
  const result = await bounded(run(f, stageConfig(f)), "unknown-tool");
  expect(result).toMatchObject({ exit: 0, cause: "success" });
  const record = await events(f.writer.recordPath);
  consistent(record, 1);
  expect(record.filter((event) => event["event"] === "tool_call")).toHaveLength(0);
});

test("an oversized response and output stay bounded and sealed", async () => {
  let output = "";
  const huge = "y".repeat(1 << 20);
  const f = await fixture([
    async () => { await writeFile(output, huge); return fauxAssistantMessage(huge); },
  ]);
  output = f.output;
  const result = await bounded(run(f, stageConfig(f)), "oversized");
  expect(result).toMatchObject({ exit: 0, cause: "success" });
  const end = consistent(await events(f.writer.recordPath), 1);
  expect(end).toMatchObject({ exit: 0, cause: "success", sealed: true, judged: true });
});

// Ticket 0063 item 18 — nothing witnessed that a response ARRIVES incrementally.
// The oversized test above was argued to cover it; the driver falsified that by
// setting the faux chunk to 4 MiB, so the whole mebibyte came as a SINGLE delta,
// and the entire suite stayed green. How finely a transport chops a response is
// the transport's business, but whether the tree consumes a stream at all is the
// tree's, and `message_update` is the harness's own seam for it — the event
// pi-tap deliberately ignores, which is exactly why nothing else can see it.
test("an oversized response is consumed as a stream of deltas, not as one blob", async () => {
  let output = "";
  const huge = "y".repeat(1 << 20);
  const f = await fixture([
    async () => { await writeFile(output, huge); return fauxAssistantMessage(huge); },
  ]);
  output = f.output;
  let deltas = 0;
  const detach = f.harness.subscribe((event) => { if (event.type === "message_update") deltas += 1; });
  // Full-suite coverage twice pushed this one-mebibyte proof past the shared
  // four-second guard (4.807s and 4.379s). Keep the deadlock bound, accepting
  // four more seconds before a true hang is reported for this proof alone.
  const result = await bounded(run(f, stageConfig(f)), "incremental delivery", 8_000);
  detach();
  expect(result).toMatchObject({ exit: 0, cause: "success" });
  // One mebibyte at hostile.ts's pinned 256-token chunk is ~1,000 deltas. The
  // bound sits far below that and far above one on purpose: what is under test
  // is that the response was consumed piece by piece, not the piece size.
  expect(deltas).toBeGreaterThan(100);
});

test("a logical provider operation is durable before its controlled response completes", async () => {
  let release = (_message: ReturnType<typeof fauxAssistantMessage>): void => undefined;
  const settled = new Promise<ReturnType<typeof fauxAssistantMessage>>((resolve) => { release = resolve; });
  const f = await fixture([{ hostile: "held", settle: settled }]);
  f.ownProvider(1, () => { release(fauxAssistantMessage("cleanup")); });
  const running = run(f, stageConfig(f));

  await f.hostile.lifecycle.await(1, "stream started", "held response start");
  const waiting = await events(f.writer.recordPath);
  expect(waiting.at(-1)).toMatchObject({
    event: "provider_start", stage: "01-work", retry: 1, provider: "faux", model: "faux-1",
  });
  expect(waiting.some((event) => event["event"] === "turn")).toBe(false);

  await writeFile(f.output, "answer");
  release(fauxAssistantMessage("done"));
  await expect(bounded(running, "controlled provider response")).resolves.toMatchObject({ exit: 0, cause: "success" });
  await f.hostile.lifecycle.await(1, "stream settled", "held response settlement");
  await f.harness.waitForIdle();
  await f.writer.drain();
  const completed = await events(f.writer.recordPath);
  expect(completed.findIndex((event) => event["event"] === "provider_start"))
    .toBeLessThan(completed.findIndex((event) => event["event"] === "turn"));
});

test("a stream that never resolves ends at the stage timeout, not never", async () => {
  const f = await fixture([{ hostile: "never" }]);
  f.abandonProvider(1);
  const running = run(f, stageConfig(f));
  await f.hostile.lifecycle.await(1, "stream started", "never stream start");
  f.clock.fire();
  const result = await bounded(running, "never-resolving stream");
  expect(result).toMatchObject({ exit: 1, cause: "timeout" });
  const record = await events(f.writer.recordPath);
  const end = consistent(record, 1);
  expect(end).toMatchObject({ exit: 1, cause: "timeout" });
  expect(record.filter((event) => event["event"] === "provider_start")).toHaveLength(1);
  expect(record.filter((event) => event["event"] === "turn")).toHaveLength(0);
});

test("a mid-stream truncation that goes silent ends at the stage timeout", async () => {
  let release = (_message: AssistantMessage): void => undefined;
  const settle = new Promise<AssistantMessage>((resolve) => { release = resolve; });
  const f = await fixture([{ hostile: "truncate", settle }]);
  f.ownProvider(1, () => { release(fauxAssistantMessage("cleanup")); });
  const running = run(f, stageConfig(f));
  await f.hostile.lifecycle.await(1, "stream started", "truncated stream start");
  f.clock.fire();
  const result = await bounded(running, "mid-stream truncation");
  expect(result).toMatchObject({ exit: 1, cause: "timeout" });
  release(fauxAssistantMessage("settled after timeout"));
  await f.hostile.lifecycle.await(1, "stream settled", "truncated stream settlement");
  await f.harness.waitForIdle();
  await f.writer.drain();
  const end = consistent(await events(f.writer.recordPath), 1);
  expect(end["output"]).toBeUndefined();
});

test("a stream that ends without a final message is bounded by the stage timeout", async () => {
  let release = (_message: AssistantMessage): void => undefined;
  const settle = new Promise<AssistantMessage>((resolve) => { release = resolve; });
  const f = await fixture([{ hostile: "end-empty", settle }]);
  f.ownProvider(1, () => { release(fauxAssistantMessage("cleanup")); });
  const running = run(f, stageConfig(f));
  await f.hostile.lifecycle.await(1, "stream started", "end-empty stream start");
  f.clock.fire();
  const result = await bounded(running, "end-empty stream");
  expect(result).toMatchObject({ exit: 1, cause: "timeout" });
  release(fauxAssistantMessage("result-only settlement"));
  await f.hostile.lifecycle.await(1, "stream settled", "end-empty stream settlement");
  await f.harness.waitForIdle();
  await f.writer.drain();
  consistent(await events(f.writer.recordPath), 1);
});

test("a stream that resolves only after abort still ends as the timeout it was", async () => {
  const f = await fixture([{ hostile: "after-abort", message: fauxAssistantMessage("late but complete") }]);
  f.ownProvider(1);
  const running = run(f, stageConfig(f));
  await f.hostile.lifecycle.await(1, "stream started", "after-abort stream start");
  f.clock.fire();
  await f.hostile.lifecycle.await(1, "abort observed", "after-abort observation");
  await f.hostile.lifecycle.await(1, "stream settled", "after-abort settlement");
  const result = await bounded(running, "resolves after abort");
  expect(result).toMatchObject({ exit: 1, cause: "timeout" });
  await f.harness.waitForIdle();
  await f.writer.drain();
  expect(f.hostile.lifecycle.order(1)).toEqual(["stream started", "abort observed", "stream settled"]);
  consistent(await events(f.writer.recordPath), 1);
});

test("the timeout may arm before the provider stream starts", async () => {
  const beforeController = latch();
  const f = await fixture([{ hostile: "after-abort", message: fauxAssistantMessage("late but complete") }], createControlTools(), beforeController);
  f.ownProvider(1);
  const running = run(f, stageConfig(f));

  await waitFor(() => f.clock.pending() > 0);
  expect((await events(f.writer.recordPath)).filter((event) => event["event"] === "provider_start")).toHaveLength(0);
  expect(f.hostile.lifecycle.last(1)).toBe("not started");

  beforeController.release();
  await f.hostile.lifecycle.await(1, "stream started", "controlled provider start");
  f.clock.fire();
  await f.hostile.lifecycle.await(1, "abort observed", "controlled abort observation");
  await f.hostile.lifecycle.await(1, "stream settled", "controlled provider settlement");
  await expect(bounded(running, "pre-provider boundary")).resolves.toMatchObject({ exit: 1, cause: "timeout" });
  await f.harness.waitForIdle();
  await f.writer.drain();
});

test("a tool result arriving after the timeout changes nothing already recorded", async () => {
  const started = latch();
  const release = latch();
  const settled = latch();
  const linger: HarnessTool<ControlContext> = {
    name: "linger",
    label: "Linger",
    description: "Resolves only when the test releases it.",
    parameters: Type.Object({}),
    execute: async () => {
      started.release();
      await release.promise;
      settled.release();
      return { content: [{ type: "text" as const, text: "late" }], details: {} };
    },
  };
  const f = await fixture(
    [fauxAssistantMessage([fauxToolCall("linger", {})], { stopReason: "toolUse" })],
    [...createControlTools(), linger],
  );
  f.ownProvider(1);
  f.ownTool({ started: started.promise, settled: settled.promise, release: release.release });
  const running = run(f, stageConfig(f));
  await started.promise;
  f.clock.fire();
  const result = await bounded(running, "tool result after timeout");
  expect(result).toMatchObject({ exit: 1, cause: "timeout" });
  const before = await events(f.writer.recordPath);
  consistent(before, 1);
  release.release();
  await settled.promise;
  await f.harness.waitForIdle();
  await f.writer.drain();
  expect(await events(f.writer.recordPath)).toEqual(before);
});

test("cleanup settles a run whose assertion fails before the provider starts", async () => {
  const beforeController = latch();
  const f = await fixture([{ hostile: "after-abort", message: fauxAssistantMessage("cleanup") }], createControlTools(), beforeController);
  f.ownProvider(1);
  const running = run(f, stageConfig(f));
  const sentinel = new Error("sentinel before provider start");
  let caught: unknown;

  try {
    await waitFor(() => f.clock.pending() > 0);
    expect(f.hostile.lifecycle.last(1)).toBe("not started");
    throw sentinel;
  } catch (reason: unknown) {
    caught = reason;
  } finally {
    await f.cleanup();
  }

  expect(caught).toBe(sentinel);
  await expect(running).resolves.toMatchObject({ exit: 1, cause: "timeout" });
  expect(f.hostile.lifecycle.order(1)).toEqual(["stream started", "abort observed", "stream settled"]);
  await expect(access(f.root)).rejects.toMatchObject({ code: "ENOENT" });
});

test("cleanup releases an earlier held invocation before considering a registered later invocation", async () => {
  let release = (_message: AssistantMessage): void => undefined;
  const first = new Promise<AssistantMessage>((resolve) => { release = resolve; });
  const f = await fixture([{ hostile: "held", settle: first }, { hostile: "never" }]);
  f.ownProvider(1, () => { release(fauxAssistantMessage("cleanup")); });
  f.abandonProvider(2);
  const running = run(f, stageConfig(f));
  const sentinel = new Error("sentinel during first invocation");
  let caught: unknown;

  try {
    await f.hostile.lifecycle.await(1, "stream started", "first invocation start");
    expect(f.hostile.lifecycle.last(2)).toBe("not started");
    throw sentinel;
  } catch (reason: unknown) {
    caught = reason;
  } finally {
    await f.cleanup();
  }

  expect(caught).toBe(sentinel);
  await expect(running).resolves.toMatchObject({ exit: 1, cause: "timeout" });
  expect(f.hostile.lifecycle.last(1)).toBe("stream settled");
  expect(f.hostile.lifecycle.last(2)).toBe("not started");
  await expect(access(f.root)).rejects.toMatchObject({ code: "ENOENT" });
});

test("a lifecycle guard failure identifies its invocation and last state", async () => {
  const beforeController = latch();
  const f = await fixture([{ hostile: "after-abort", message: fauxAssistantMessage("cleanup") }], createControlTools(), beforeController);
  await expect(f.hostile.lifecycle.await(1, "stream started", "provider readiness", 1)).rejects.toThrow(
    "provider readiness: expected invocation 1 stream started; last state: not started",
  );
});

test("LOOP: a hung provider during the question ends at the timeout with the judged output kept", async () => {
  let output = "";
  const f = await fixture([
    async () => { await writeFile(output, "ready"); return fauxAssistantMessage("done"); },
    { hostile: "never" },
  ]);
  output = f.output;
  f.abandonProvider(2);
  const running = run(f, { ...f.common, mode: "loop", question: "Ready?", outputPath: f.output, outputExtension: "txt" });
  // The work prompt's timer clears when checks pass; the surviving timer is the question's.
  await waitFor(async () => (await events(f.writer.recordPath)).some((event) => event["check"] === "output"));
  await f.hostile.lifecycle.await(2, "stream started", "loop question stream start");
  f.clock.fire();
  const result = await bounded(running, "loop question hang");
  expect(result).toMatchObject({ exit: 1, cause: "timeout" });
  const end = consistent(await events(f.writer.recordPath), 1);
  expect(end).toMatchObject({ exit: 1, cause: "timeout", judged: true, sealed: false });
});

test("CHOOSE: a hung provider ends at the timeout with no chose event", async () => {
  const f = await fixture([{ hostile: "never" }]);
  f.abandonProvider(1);
  const running = run(f, { ...f.common, mode: "choose", alternatives: ["patch", "revert"] });
  await f.hostile.lifecycle.await(1, "stream started", "choose stream start");
  f.clock.fire();
  const result = await bounded(running, "choose hang");
  expect(result).toMatchObject({ exit: 1, cause: "timeout" });
  expect(result.selection).toBeUndefined();
  const record = await events(f.writer.recordPath);
  consistent(record, 1);
  expect(record.filter((event) => event["event"] === "chose")).toHaveLength(0);
});

// Ticket 0034 item 1 — record.md: "`retry` counts attempts"; an event belongs
// to the attempt that produced it. `nextAttempt` mutates the identity the tap
// holds by reference, so a tool result still settling when the send-back bumps
// `retry` must keep its own attempt's number. The runtime reaches its send-back
// only after the harness settles, so the boundary is driven with the exported
// `nextAttempt` at the one moment it could interleave: while mark's execute is
// held open by the test's gate.
test("a tool result settling across the attempt boundary keeps its own attempt's retry", async () => {
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let markStarted = false;
  const gated = createControlTools().map((tool) => tool.name !== "mark" ? tool : {
    ...tool,
    execute: async (...args: Parameters<typeof tool.execute>) => {
      markStarted = true;
      await gate;
      return tool.execute(...args);
    },
  });
  let output = "";
  const f = await fixture([
    fauxAssistantMessage([fauxToolCall("mark", { item: 1, state: "done", evidence: "Completed the work." })], { stopReason: "toolUse" }),
    async () => { await writeFile(output, "late pass"); return fauxAssistantMessage("done"); },
  ], gated);
  output = f.output;
  const input: GatingInput = {
    harness: f.harness, controls: f.controls, writer: f.writer,
    identity: { stage: "01-work", retry: 1 }, clock: f.clock, close: () => f.harness.close(),
    config: { ...f.common, mode: "stage", outputPath: f.output, outputExtension: "txt", checklist: ["account for the work"] },
  };
  const running = runGating(input);
  await waitFor(() => markStarted);
  await nextAttempt(input);
  release();
  const result = await bounded(running, "tool result across the attempt boundary");
  expect(result).toMatchObject({ exit: 0, cause: "success" });
  const record = await events(f.writer.recordPath);
  expect(record.find((event) => event["event"] === "tool_call")).toMatchObject({ tool: "mark", decision: "done", item: 1, evidence: "Completed the work.", retry: 1 });
  expect(record.find((event) => event["event"] === "turn")).toMatchObject({ retry: 1 });
});

test("CHOOSE: a provider error is one fault and selects nothing", async () => {
  const f = await fixture([fauxAssistantMessage("", { stopReason: "error", errorMessage: "chooser died" })]);
  const result = await bounded(run(f, { ...f.common, mode: "choose", alternatives: ["patch", "revert"] }), "choose error");
  expect(result).toMatchObject({ exit: 2, cause: "fault", reason: "chooser died" });
  expect(result.selection).toBeUndefined();
  const record = await events(f.writer.recordPath);
  consistent(record, 1);
  expect(record.filter((event) => event["event"] === "chose")).toHaveLength(0);
});

// Ticket 0133 leg 1 — invariant 22: "a stage's `timeout` covers the agent's
// work across every send-back". The ledger recorded the probe that proves this
// had no witness: dropping `budget.milliseconds` from `turns.ts`'s subtraction,
// so every send-back armed a whole fresh budget, left all tests green.
// `clock.test.ts` pins the accumulation in `createAgentClock`; nothing pinned
// the runtime USING it. What the deadline is, is the whole subject: the second
// attempt is armed at the FIRST attempt's deadline, because the budget is the
// stage's and not the turn's. A `held` stream lets the test spend the first
// attempt's time to the millisecond before letting it settle.
const STAGE_BUDGET_MS = 1_000;
const FIRST_ATTEMPT_MS = 700;

test("the stage budget covers every send-back: the second attempt is armed at the first attempt's deadline", async () => {
  let settle = (_message: AssistantMessage): void => undefined;
  const first = new Promise<AssistantMessage>((resolve) => { settle = resolve; });
  const f = await fixture([{ hostile: "held", settle: first }, { hostile: "never" }]);
  f.ownProvider(1, () => { settle(fauxAssistantMessage("cleanup")); });
  f.abandonProvider(2);
  const running = run(f, { ...f.common, timeoutMs: STAGE_BUDGET_MS, mode: "stage", outputPath: f.output, outputExtension: "txt" });

  // Attempt one: armed for the whole budget, and it spends most of it.
  await f.hostile.lifecycle.await(1, "stream started", "first budget attempt start");
  expect(f.clock.due()).toEqual([STAGE_BUDGET_MS]);
  f.clock.advance(FIRST_ATTEMPT_MS);
  settle(fauxAssistantMessage("nothing written"));

  // Attempt two, reached through the missing-output send-back: same deadline.
  // If the spend were dropped this would read 1,700 and the advances below
  // would never reach it.
  await waitFor(async () => (await events(f.writer.recordPath)).some((event) => event["check"] === "output"));
  await f.hostile.lifecycle.await(2, "stream started", "second budget attempt start");
  expect(f.clock.elapsed()).toBe(FIRST_ATTEMPT_MS);
  expect(f.clock.due()).toEqual([STAGE_BUDGET_MS]);
  f.clock.advance(STAGE_BUDGET_MS - FIRST_ATTEMPT_MS - 1);
  expect(f.clock.pending()).toBe(1);
  f.clock.advance(1);

  const result = await bounded(running, "send-back budget");
  expect(result).toMatchObject({ exit: 1, cause: "timeout" });
  expect(f.clock.elapsed()).toBe(STAGE_BUDGET_MS);
  consistent(await events(f.writer.recordPath), 2);
});
