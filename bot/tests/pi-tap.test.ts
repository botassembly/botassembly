import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import type { HarnessEvent } from "../src/harness.ts";
import { attachPiTap, createPiTap } from "../src/pi-tap.ts";
import { runStartEvent } from "../src/record-events.ts";
import { createRecordWriter } from "../src/record.ts";
import { showLine } from "../src/readings.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tapFixture() {
  const root = await mkdtemp(join(tmpdir(), "bot-pi-tap-test-"));
  roots.push(root);
  const runs = join(root, "runs");
  await mkdir(runs);
  const created = await createRecordWriter(runs, runStartEvent({
    ts: "2026-07-31T12:00:00.000Z",
    run: "2026-07-31T12-00-00-cafe",
    assembly: "tap",
    assemblyHash: "a".repeat(64),
    flow: "main",
    request: { path: "request.txt", sha256: "b".repeat(64), bytes: 1, via: "stdin" },
  }));
  if (created.status !== "created") throw new Error("fresh temporary run name was taken");
  let tick = 0;
  const tap = createPiTap({
    writer: created.writer,
    identity: { stage: "02-loop/01-work", repeat: 3, retry: 2 },
    now: () => `2026-07-31T12:00:0${String(tick++)}.000Z`,
  });
  return { writer: created.writer, tap };
}

async function send(tap: (event: HarnessEvent) => Promise<void>, event: HarnessEvent): Promise<void> {
  await tap(event);
}

test("Pi turn and control-tool events are tapped with explicit stage identity", async () => {
  const { writer, tap } = await tapFixture();
  const message = fauxAssistantMessage("done");
  message.usage = {
    input: 11,
    output: 7,
    cacheRead: 5,
    cacheWrite: 3,
    totalTokens: 26,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
  await send(tap, { type: "turn_end", message });
  await send(tap, { type: "tool_execution_start", toolCallId: "mark-1", toolName: "mark", args: { item: 2, state: "skipped", evidence: "The item does not apply.", reason: "not applicable" } });
  await send(tap, { type: "tool_execution_end", toolCallId: "mark-1", toolName: "mark", result: { details: { state: "skipped", item: 2, evidence: "The item does not apply.", reason: "not applicable" } }, isError: false });
  await send(tap, { type: "tool_execution_start", toolCallId: "continue-1", toolName: "continue", args: { answer: "stop", reason: "done" } });
  await send(tap, { type: "tool_execution_end", toolCallId: "continue-1", toolName: "continue", result: { details: { answer: "stop", reason: "done" } }, isError: false });
  await send(tap, { type: "tool_execution_start", toolCallId: "select-1", toolName: "select", args: { name: "patch", reason: "safe" } });
  await send(tap, { type: "tool_execution_end", toolCallId: "select-1", toolName: "select", result: { details: { name: "patch", reason: "safe" } }, isError: false });
  await writer.drain();
  const events = (await readFile(writer.recordPath, "utf8")).trimEnd().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(events[1]).toMatchObject({
    event: "turn", stage: "02-loop/01-work", repeat: 3, retry: 2,
    provider: "faux", model: "faux-1", input: 11, output: 7,
    cache_read: 5, cache_write: 3, total: 26, stop: "stop",
  });
  expect(events[2]).toMatchObject({
    event: "tool_call", stage: "02-loop/01-work", repeat: 3, retry: 2,
    tool: "mark", decision: "skipped", item: 2, evidence: "The item does not apply.", reason: "not applicable",
  });
  expect(events[3]).toMatchObject({ event: "tool_call", tool: "continue", decision: "stop", reason: "done" });
  expect(events[4]).toMatchObject({ event: "tool_call", tool: "select", decision: "patch", reason: "safe" });
});

test("Pi records requested transport separately from an adapter-published fallback", async () => {
  const { writer, tap } = await tapFixture();
  const requested = fauxAssistantMessage("requested");
  requested.provider = "openai-codex";
  const fellBack = fauxAssistantMessage("fallback");
  fellBack.provider = "openai-codex";
  fellBack.diagnostics = [{
    type: "provider_transport_failure", timestamp: 1,
    details: {
      configuredTransport: "websocket", fallbackTransport: "sse", eventsEmitted: false,
      phase: "before_message_stream_start",
    },
    error: { name: "CodexApiError", message: "overloaded", code: 429 },
  }];
  await send(tap, { type: "turn_end", message: requested });
  await send(tap, { type: "turn_end", message: fellBack });
  await writer.drain();
  const events = (await readFile(writer.recordPath, "utf8")).trimEnd().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(events).toContainEqual(expect.objectContaining({
    event: "provider_transport", transport: "websocket", source: "requested",
  }));
  expect(events).toContainEqual(expect.objectContaining({
    event: "provider_transport", transport: "sse", source: "diagnostic",
    configured_transport: "websocket", events_emitted: false,
    phase: "before_message_stream_start",
    error: { name: "CodexApiError", message: "overloaded", code: 429 },
  }));
  const diagnostic = events.find((event) => event["source"] === "diagnostic") ?? {};
  expect(showLine(diagnostic)).toContain("events emitted false");
});

test("Pi subflow batches emit one honest event per synthetic call", async () => {
  const { writer, tap } = await tapFixture();
  await send(tap, {
    type: "tool_execution_start",
    toolCallId: "subflow-1",
    toolName: "subflow",
    args: { calls: [{ flow: "oracle", input: "question" }, { flow: "review", "input-file": "$TMP/page.md" }] },
  });
  await send(tap, {
    type: "tool_execution_end",
    toolCallId: "subflow-1",
    toolName: "subflow",
    result: { details: [
      { call: 1, started: true, exit: 0, cause: "success", child: "stages/02-loop/01-work/3/2/subflows/1", depth: 1 },
      { call: 2, started: false, depth: 1, input: { path: "tmp/page.md", sha256: "c".repeat(64), bytes: 9 } },
    ] },
    isError: false,
  });
  await writer.drain();
  const events = (await readFile(writer.recordPath, "utf8")).trimEnd().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(events[1]).toMatchObject({
    event: "subflow_call", call: 1, flow: "oracle", started: true, exit: 0,
    cause: "success", input: { text: "question", bytes: 8 }, depth: 1,
  });
  expect(events[2]).toEqual({
    ts: "2026-07-31T12:00:01.000Z",
    event: "subflow_call",
    stage: "02-loop/01-work",
    repeat: 3,
    retry: 2,
    call: 2,
    flow: "review",
    input: { path: "tmp/page.md", sha256: "c".repeat(64), bytes: 9 },
    depth: 1,
    started: false,
  });
  expect(attachPiTap).toBeTypeOf("function");
});

// Ticket 0144: detaching only removes the listener — a handler suspended at an
// await keeps running, and its appends could land after the stage's closing
// stage_end. The barrier: detach settles only when in-flight appends have.
test("detach settles only after an in-flight tap append lands", async () => {
  const appended: string[] = [];
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const writer = {
    runDirectory: "/nowhere",
    recordPath: "/nowhere/record.jsonl",
    append: async (event: { event: string }) => { await gate; appended.push(event.event); },
  };
  let handler: ((event: HarnessEvent) => Promise<void>) | undefined;
  let subscribed = true;
  let providerHook = true;
  const harness = {
    subscribe: (held: (event: HarnessEvent) => Promise<void>) => {
      handler = held;
      return () => { subscribed = false; };
    },
    beforeProviderRequest: () => {
      return () => { providerHook = false; };
    },
  };
  const detach = attachPiTap(harness as never, {
    writer: writer as never,
    identity: { stage: "01-work", retry: 1 },
    now: () => "2026-08-25T00:00:00.000Z",
  });
  const message = fauxAssistantMessage("done");
  message.usage = {
    input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
  if (handler === undefined) throw new Error("the tap never subscribed");
  void handler({ type: "turn_end", message });
  let settled = false;
  const detachBarrier: () => unknown = detach;
  const barrier = Promise.resolve(detachBarrier()).then(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  expect(settled).toBe(false);
  release();
  await barrier;
  appended.push("stage_end");
  expect(appended).toEqual(["turn", "stage_end"]);
  expect({ subscribed, providerHook }).toEqual({ subscribed: false, providerHook: false });
});
