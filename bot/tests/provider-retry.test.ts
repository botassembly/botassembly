import { MemorySessionRepo, TODO_CONTEXT } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream, createModels, fauxAssistantMessage, fauxProvider, fauxToolCall, type AssistantMessage, type AssistantMessageEventStream, type FauxResponseStep } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { createHarness, createSessionHarness, NodeExecutionEnvironment } from "../src/harness.ts";
import { runFlow, type GatingSession, type StageRuntimeContext } from "../src/flow.ts";
import { runGating, type GatingConfig, type GatingInput } from "../src/gating.ts";
import type { Assembly, Flow, StageNode } from "../src/model.ts";
import { providerModels, retryModel } from "../src/credentials.ts";

const builtins = vi.hoisted(() => ({ models: undefined as ReturnType<typeof createModels> | undefined }));
vi.mock("@earendil-works/pi-ai/providers/all", () => ({
  builtinModels: () => {
    if (builtins.models === undefined) throw new Error("provider retry fixture did not install its provider");
    return builtins.models;
  },
}));
import { runStartEvent } from "../src/record-events.ts";
import { createRecordWriter, hashBytes, type RecordWriter } from "../src/record.ts";
import { createRunSignal } from "../src/signal.ts";
import { createControlContext, createControlTools } from "../src/tools.ts";
import { bounded } from "./hostile.ts";
import { manualClock } from "./manual-clock.ts";

const roots: string[] = [];
let runNumber = 0;

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function errorUsage(message: AssistantMessage, total: number): AssistantMessage {
  return { ...message, usage: { ...message.usage, input: 0, output: total, cacheRead: 0, cacheWrite: 0, totalTokens: total } };
}

function providerErrors(input: AssistantMessageEventStream, total: number): AssistantMessageEventStream {
  const output = createAssistantMessageEventStream();
  void (async () => {
    for await (const event of input) output.push(event.type === "error" ? { ...event, error: errorUsage(event.error, total) } : event);
  })();
  return output;
}

function rejectedStream(reason: unknown): AssistantMessageEventStream {
  return {
    [Symbol.asyncIterator]: async function* () { await Promise.resolve(); throw reason; },
    result: () => new Promise<AssistantMessage>(() => undefined),
  } as unknown as AssistantMessageEventStream;
}

function expectedCauseReason(cause: unknown): string {
  if (cause !== null && typeof cause === "object" && !Array.isArray(cause)
    && "message" in cause && cause.message === "cause") return "outer: cause";
  return "outer";
}

async function fixture(responses: FauxResponseStep[], errorTokens = 0, retryAppendFailure = false, providerFailure?: unknown, retryPublicationDelayTurns = 0) {
  const clock = manualClock();
  const root = await mkdtemp(join(tmpdir(), "bot-provider-retry-"));
  roots.push(root);
  const runs = join(root, "runs");
  const input = join(root, "input");
  const output = join(root, "output.txt");
  await Promise.all([mkdir(runs), mkdir(input)]);
  const created = await createRecordWriter(runs, runStartEvent({
    ts: clock.timestamp(),
    run: `2026-08-11T20-00-${String(runNumber++).padStart(2, "0")}-cafe`,
    assembly: "provider-retry",
    assemblyHash: "a".repeat(64),
    flow: "main",
    request: { path: "request.txt", sha256: "b".repeat(64), bytes: 1, via: "stdin" },
  }));
  if (created.status !== "created") throw new Error("temporary record name collided");
  const retryWriter: RecordWriter = {
    ...created.writer,
    append: async (event) => {
      if (event.event === "provider_retry" && retryPublicationDelayTurns > 0) {
        for (let turn = 0; turn < retryPublicationDelayTurns; turn += 1) {
          await new Promise<void>((resolve) => { setImmediate(resolve); });
        }
      }
      if (event.event === "provider_retry" && retryAppendFailure) throw new Error("record append failed");
      await created.writer.append(event);
    },
  };
  const faux = fauxProvider({ provider: "openai-codex" });
  faux.setResponses(responses);
  const controls = createControlContext();
  const models = createModels();
  const repo = new MemorySessionRepo();
  const session = await repo.create({ id: "provider-retry" }, TODO_CONTEXT);
  let providerCalls = 0;
  const sessionIds: string[] = [];
  const provider: typeof faux.provider = {
    ...faux.provider,
    stream: (model, context, options) => {
      providerCalls += 1; sessionIds.push(options?.sessionId ?? "");
      return providerFailure !== undefined && providerCalls === 1
        ? rejectedStream(providerFailure)
        : providerErrors(faux.provider.stream(model, context, options), errorTokens);
    },
    streamSimple: (model, context, options) => {
      providerCalls += 1; sessionIds.push(options?.sessionId ?? "");
      return providerFailure !== undefined && providerCalls === 1
        ? rejectedStream(providerFailure)
        : providerErrors(faux.provider.streamSimple(model, context, options), errorTokens);
    },
  };
  models.setProvider(provider);
  // ModelRuntime owns provider dispatch in production. This fixture delegates
  // directly to its controlled provider so rejected iterators reach Bot's
  // selected-model retry boundary without relying on Pi's private dispatch.
  models.streamSimple = (model, context, options) => provider.streamSimple(model, context, options);
  builtins.models = models;
  const identity = { stage: "01-work", retry: 1 };
  const harness = createSessionHarness({
    models: providerModels({}, clock),
    model: retryModel(faux.getModel(), { writer: retryWriter, identity, clock, now: () => clock.timestamp() }),
    systemPrompt: "Provider retry test.",
    tools: createControlTools(),
    context: controls,
  }, session);
  const retainedMessages: AssistantMessage[] = [];
  harness.subscribe((event) => { if (event.type === "turn_end" && "stopReason" in event.message) retainedMessages.push(event.message); });
  const common = {
    timeoutMs: 5_000, retries: 1, cwd: root,
    env: { ...process.env, INPUT: input, OUTPUT: output, TMP: root, PWD: root },
    session: "stages/01-work/1/session.jsonl", received: [], options: [],
  };
  return { clock, common, controls, harness, output, writer: created.writer, identity, repo, retainedMessages, session, providerCalls: () => providerCalls, sessionIds: () => sessionIds };
}

async function events(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

const RETRY_WAIT_MS = 2_000;

function observedRetryState(record: Record<string, unknown>[]): string {
  const attempts = record.filter((event) => event["event"] === "provider_retry").map((event) => String(event["attempt"]));
  const last = record.at(-1)?.["event"];
  const lastName = typeof last === "string" ? last : last === undefined ? "none" : "unknown";
  return attempts.length === 0
    ? `no provider_retry events; last event ${lastName}`
    : `provider_retry attempts [${attempts.join(", ")}]`;
}

async function retries(path: string, atLeast: number): Promise<Record<string, unknown>[]> {
  const deadline = Date.now() + RETRY_WAIT_MS;
  let observed = "no events";
  while (Date.now() < deadline) {
    const record = await events(path);
    const found = record.filter((event) => event["event"] === "provider_retry");
    if (found.length >= atLeast) return found;
    observed = observedRetryState(record);
    await new Promise<void>((resolve) => { setImmediate(resolve); });
  }
  throw new Error(`provider retry attempt ${String(atLeast)} was not published before the deadline; observed state: ${observed}`);
}

async function retry(f: Awaited<ReturnType<typeof fixture>>, atLeast: number): Promise<void> {
  const found = await retries(f.writer.recordPath, atLeast);
  const event = found[atLeast - 1];
  if (event === undefined) throw new Error("provider retry was not retained");
  const delay = event["delay_ms"];
  if (typeof delay !== "number") throw new Error("provider retry must record its delay");
  f.clock.advance(delay);
  await vi.advanceTimersByTimeAsync(delay);
}

function run(f: Awaited<ReturnType<typeof fixture>>, config: GatingConfig) {
  const input: GatingInput = {
    harness: f.harness, controls: f.controls, writer: f.writer,
    identity: f.identity, clock: f.clock, agentClock: f.clock, config, close: () => f.harness.close(),
  };
  return runGating(input);
}

function stage(f: Awaited<ReturnType<typeof fixture>>, checklist?: string[]): GatingConfig {
  return { ...f.common, mode: "stage", outputPath: f.output, outputExtension: "txt", ...(checklist === undefined ? {} : { checklist }) };
}

test("a missing provider retry reports the requested attempt and observed state", async () => {
  const f = await fixture([]);

  await expect(retries(f.writer.recordPath, 1)).rejects.toThrow(
    "provider retry attempt 1 was not published before the deadline; observed state: no provider_retry events; last event run_start",
  );
});

test("zero-token failures after tools retry twice without replaying their side effect", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  let output = "";
  const f = await fixture([
    fauxAssistantMessage([fauxToolCall("mark", { item: 1, state: "done", evidence: "Started the work." })], { stopReason: "toolUse" }),
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "upstream 503" }),
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider overloaded" }),
    async () => { await writeFile(output, "recovered"); return fauxAssistantMessage("done"); },
  ], 0, false, undefined, 1_000);
  output = f.output;
  const running = run(f, stage(f, ["account for the work"]));
  await retry(f, 1);
  await retry(f, 2);

  expect(await bounded(running, "provider retries after tools")).toMatchObject({ exit: 0, cause: "success" });
  const record = await events(f.writer.recordPath);
  expect(record.filter((event) => event["event"] === "provider_retry").map((event) => event["attempt"])).toEqual([1, 2]);
  expect(f.sessionIds()).not.toContain("");
  expect(new Set(f.sessionIds())).toHaveLength(1);
  expect(record.filter((event) => event["event"] === "tool_call" && event["tool"] === "mark")).toHaveLength(1);
});

test("provider retries retain the stage attempt as well as their own attempt", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  const f = await fixture([
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider overloaded" }),
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider overloaded" }),
    fauxAssistantMessage("no output"),
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider overloaded" }),
    async () => { await writeFile(f.output, "recovered"); return fauxAssistantMessage("done"); },
  ]);
  const running = run(f, stage(f));
  // Two transport retries precede the first stage's missing-output send-back.
  // The third begins stage attempt two and resets its local provider attempt.
  await retry(f, 1);
  await retry(f, 2);
  await retry(f, 3);

  expect(await bounded(running, "provider retries after a stage send-back")).toMatchObject({ exit: 0, cause: "success" });
  const record = await events(f.writer.recordPath);
  expect(record.filter((event) => event["event"] === "provider_retry")
    .map((event) => ({ retry: event["retry"], attempt: event["attempt"] })))
    .toEqual([{ retry: 1, attempt: 1 }, { retry: 1, attempt: 2 }, { retry: 2, attempt: 1 }]);
});

test("a failed retry append faults the stage", async () => {
  const f = await fixture([
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider overloaded" }),
  ], 0, true);

  expect(await bounded(run(f, stage(f)), "failed provider retry append")).toMatchObject({
    exit: 2, cause: "fault", reason: "record append failed",
  });
  expect(await events(f.writer.recordPath)).toContainEqual(expect.objectContaining({
    event: "stage_end", exit: 2, cause: "fault", reason: "record append failed",
  }));
});

test("a token-spending failure faults without scheduling another provider call", async () => {
  const f = await fixture([
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider overloaded" }),
  ], 1);
  const running = run(f, stage(f));

  expect(await bounded(running, "token-spending provider failure")).toMatchObject({ exit: 2, cause: "fault" });
  expect(f.providerCalls()).toBe(1);
});

test("exhausted zero-token provider retries preserve the fault reason", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  const f = await fixture([
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider overloaded" }),
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider overloaded" }),
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider overloaded" }),
  ]);
  const running = run(f, stage(f));
  await retry(f, 1);
  await retry(f, 2);

  expect(await bounded(running, "exhausted provider retries")).toMatchObject({ exit: 2, cause: "fault", reason: "provider overloaded" });
  expect(await events(f.writer.recordPath)).toContainEqual(expect.objectContaining({
    event: "stage_end", exit: 2, cause: "fault", reason: "provider overloaded",
  }));
});

test("a rejected provider stream carries its direct cause through the session and stage ending", async () => {
  const cause = { message: "unable to get local issuer certificate", code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", deeper: { message: "ignored" } };
  const f = await fixture([], 0, false, new Error("fetch failed", { cause }));

  const result = await bounded(run(f, stage(f)), "provider rejection with direct cause");
  const expected = "fetch failed: unable to get local issuer certificate [UNABLE_TO_GET_ISSUER_CERT_LOCALLY]";
  expect(result).toMatchObject({ exit: 2, cause: "fault", reason: expected });
  expect(await events(f.writer.recordPath)).toContainEqual(expect.objectContaining({
    event: "stage_end", exit: 2, cause: "fault", reason: expected,
  }));
  expect(f.retainedMessages).toContainEqual(expect.objectContaining({ errorMessage: expected, stopReason: "error" }));
});

test("a qualifying cause without a code is appended to the outer message", async () => {
  const f = await fixture([], 0, false, new Error("outer", { cause: { message: "cause detail" } }));

  expect(await bounded(run(f, stage(f)), "provider rejection without code")).toMatchObject({
    exit: 2, cause: "fault", reason: "outer: cause detail",
  });
});

test.each([
  [null, "null cause"],
  ["cause", "primitive cause"],
  [[], "array cause"],
  [{ message: "" }, "empty cause message"],
  [{ message: 42, code: "IGNORED" }, "non-string cause message"],
  [{ message: "cause", code: "" }, "empty cause code"],
  [{ message: "cause", code: 42 }, "non-string cause code"],
] as const)("a %s does not change the outer provider error", async (cause, label) => {
  const f = await fixture([], 0, false, new Error("outer", { cause }));

  expect(await bounded(run(f, stage(f)), label)).toMatchObject({
    exit: 2, cause: "fault", reason: expectedCauseReason(cause),
  });
});

test("a multibyte provider reason uses the shared UTF-8-safe bound once", async () => {
  const f = await fixture([], 0, false, new Error("é".repeat(1_023), { cause: { message: "cause" } }));

  const result = await bounded(run(f, stage(f)), "multibyte provider reason");
  const reason = result.reason ?? "";
  expect(Buffer.byteLength(reason, "utf8")).toBeLessThanOrEqual(2_048);
  expect(reason).toBe(`${"é".repeat(1_022)}…`);
  expect(reason).not.toContain("�");
});

test("a nested cause is ignored and a non-Error rejection keeps its fixed fallback", async () => {
  const nested = await fixture([], 0, false, new Error("outer", { cause: { message: "direct", cause: { message: "nested" } } }));
  expect(await bounded(run(nested, stage(nested)), "nested provider cause")).toMatchObject({ reason: "outer: direct" });

  const nonError = await fixture([], 0, false, "provider failed");
  expect(await bounded(run(nonError, stage(nonError)), "non-Error provider rejection")).toMatchObject({
    exit: 2, cause: "fault", reason: "The provider retry failed with a non-Error value.",
  });
});

test("a full flow persists the provider cause in the raw session and both terminal events", async () => {
  const clock = manualClock();
  const root = await mkdtemp(join(tmpdir(), "bot-provider-retry-flow-"));
  roots.push(root);
  const runs = join(root, "runs");
  const scratch = join(root, "scratch");
  const requestPath = join(root, "request.txt");
  await Promise.all([mkdir(runs), mkdir(scratch), writeFile(requestPath, "request bytes")]);
  const created = await createRecordWriter(runs, runStartEvent({
    ts: clock.timestamp(), run: `2026-08-11T21-00-${String(runNumber++).padStart(2, "0")}-beef`,
    assembly: "provider-retry-flow", assemblyHash: "a".repeat(64), flow: "main",
    request: { path: "request.txt", sha256: hashBytes("request bytes"), bytes: 13, via: "stdin" },
  }));
  if (created.status !== "created") throw new Error("temporary record name collided");

  const cause = { message: "unable to get local issuer certificate", code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" };
  const failure = new Error("fetch failed", { cause });
  const faux = fauxProvider({ provider: "openai-codex" });
  const models = createModels();
  let calls = 0;
  const provider: typeof faux.provider = {
    ...faux.provider,
    stream: (model, context, options) => {
      calls += 1;
      return calls === 1 ? rejectedStream(failure) : faux.provider.stream(model, context, options);
    },
    streamSimple: (model, context, options) => {
      calls += 1;
      return calls === 1 ? rejectedStream(failure) : faux.provider.streamSimple(model, context, options);
    },
  };
  models.setProvider(provider);
  models.streamSimple = (model, context, options) => provider.streamSimple(model, context, options);
  builtins.models = models;

  const node: StageNode = {
    kind: "STAGE", name: "01-work", path: "flows/main/01-work.md", single: true,
    options: {}, files: ["01-work.md"], extension: "txt", skills: [], subflows: new Map(), body: "Do the work.",
  };
  const flow: Flow = {
    name: "main", path: "flows/main", options: {}, sequence: { path: "flows/main", nodes: [node] },
    skills: [], subflows: new Map(),
  };
  const assembly: Assembly = {
    root: root, options: {}, slots: {}, skills: [], flows: new Map([[flow.name, flow]]), subflows: new Map(), faults: [],
  };
  const createGating = async (context: StageRuntimeContext): Promise<GatingSession> => {
    const execution = new NodeExecutionEnvironment({ cwd: context.env["PWD"] ?? root, shellEnv: context.env });
    const controls = createControlContext();
    const harness = await createHarness({
      execution, sessionFile: context.sessionFile, session: { cwd: context.env["PWD"] ?? root, id: context.identity.stage, createdAt: Date.parse(context.clock.timestamp()) }, models: providerModels({}, clock),
      model: retryModel(faux.getModel(), { writer: created.writer, identity: context.identity, clock, now: () => clock.timestamp() }),
      systemPrompt: "Provider retry flow test.", tools: context.tools, context: controls,
    });
    if (context.outputPath === undefined) throw new Error("flow test expected an output path");
    return {
      harness, controls, close: () => harness.close(), config: {
        timeoutMs: 5_000, retries: 0, cwd: context.env["PWD"] ?? root, env: context.env,
        session: context.sessionPath, received: context.received, options: [], outputPath: context.outputPath,
        outputExtension: "txt", mode: "stage",
      },
    };
  };
  const result = await bounded(runFlow({
    assembly, flow, writer: created.writer,
    request: { name: "request", extension: "txt", diskPath: requestPath, record: { path: "request.txt", sha256: hashBytes("request bytes") } },
    workdir: root, scratchDirectory: scratch, baseEnv: {}, slots: {},
    invocation: { target: "", home: "", requestExtension: "txt", taskOptions: {}, commandOptions: {}, supplied: new Map(), valueless: new Set(), faults: [] },
    home: { options: {}, intelligences: {} }, metadata: { assembly: "provider-retry-flow", assemblyHash: "a".repeat(64), installationId: "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8" },
    clock, signal: createRunSignal(clock), progress: () => undefined, createGating,
  }), "provider rejection full flow");
  const expected = "fetch failed: unable to get local issuer certificate [UNABLE_TO_GET_ISSUER_CERT_LOCALLY]";
  expect(result).toMatchObject({ exit: 2, cause: "fault", reason: expected });

  const record = await events(created.writer.recordPath);
  expect(record).toContainEqual(expect.objectContaining({ event: "stage_end", reason: expected }));
  expect(record).toContainEqual(expect.objectContaining({ event: "run_end", reason: expected }));
  const session = (await readFile(join(created.writer.runDirectory, "stages/01-work/1/session.jsonl"), "utf8"))
    .trimEnd().split("\n").flatMap((line) => { const parsed: unknown = JSON.parse(line); return Array.isArray(parsed) ? parsed as { message?: { role?: string; errorMessage?: string } }[] : []; });
  expect(session.find((entry) => entry.message?.role === "assistant")?.message?.errorMessage).toBe(expected);
});
