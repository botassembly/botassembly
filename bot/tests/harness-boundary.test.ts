import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type, createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { afterEach, expect, test, vi } from "vitest";
import { TODO_CONTEXT } from "@earendil-works/pi-agent-core";
import { HarnessCloseError, NodeExecutionEnvironment, createHarness, createMemoryHarness, createWriteTool, prepareHarness, type ExecutionEnvironment, type HarnessTool } from "../src/harness.ts";
import { defaultGating } from "../src/machinery.ts";
import type { StageRuntimeContext } from "../src/flow.ts";
import type { Accepted } from "../src/reader.ts";
import type { RecordWriter } from "../src/record.ts";
import { createControlContext, createControlTools } from "../src/tools.ts";
import { createRunSignal } from "../src/signal.ts";
import { assembly, clock, events, flow, roots as flowRoots, stage, start, writes } from "./flow-harness.ts";
import { bareInvocation, hostileModels } from "./hostile.ts";

const source = join(dirname(fileURLToPath(import.meta.url)), "../src");
const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...roots.splice(0), ...flowRoots.splice(0)].map((root) => rm(root, { recursive: true, force: true })));
});
test("only the Bot harness adapter imports pi-agent-core in production", async () => {
  const offenders: string[] = [];
  const productionFiles = (await readdir(source)).filter((name) => name.endsWith(".ts") && name !== "harness.ts").sort();
  for (const name of productionFiles) {
    if ((await readFile(join(source, name), "utf8")).includes("@earendil-works/pi-agent-core")) offenders.push(name);
  }
  expect(offenders).toEqual([]);
});

function ordinaryHarness() {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const context = createControlContext();
  const harness = createMemoryHarness({ models, model: faux.getModel(), systemPrompt: "Boundary test.", tools: createControlTools(), context });
  return { faux, harness };
}

test("the adapter settles prompts and owns active tools and normalized events", async () => {
  const { faux, harness } = ordinaryHarness();
  faux.setResponses([fauxAssistantMessage("first"), fauxAssistantMessage("second")]);
  const events: string[] = [];
  let requests = 0;
  const detachEvents = harness.subscribe((event) => { events.push(event.type); });
  const detachHook = harness.beforeProviderRequest(() => { requests += 1; });
  const first = await harness.prompt("first");
  expect(first.role).toBe("assistant");
  await harness.setActiveTools(["refuse"]);
  expect(harness.getActiveTools().map((tool) => tool.name)).toEqual(["refuse"]);
  detachEvents();
  detachHook();
  await harness.prompt("second");
  expect(events).toContain("turn_start");
  expect(events).toContain("turn_end");
  expect(requests).toBe(1);
  await harness.close();
});

test("a rejected later prompt cannot reuse an earlier operation's assistant message", async () => {
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage("first operation")]);
  const models = createModels();
  models.setProvider(faux.provider);
  const harness = createMemoryHarness({ models, model: faux.getModel(), systemPrompt: "Expected failure test.", tools: [], context: {} });
  await expect(harness.prompt("first")).resolves.toMatchObject({ role: "assistant", content: [{ type: "text", text: "first operation" }] });
  await expect(harness.prompt("")).rejects.toMatchObject({ name: "InvalidMessage" });
  await harness.close();
});

test("prompt completion waits for final turn subscribers", async () => {
  const { faux, harness } = ordinaryHarness();
  faux.setResponses([fauxAssistantMessage("complete")]);
  let start = (): void => undefined;
  const started = new Promise<void>((resolve) => { start = resolve; });
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let settled = false;
  harness.subscribe(async (event) => {
    if (event.type !== "turn_end") return;
    start();
    await held;
  });
  const pending = harness.prompt("wait for the record").then((message) => { settled = true; return message; });
  await started;
  expect(settled).toBe(false);
  release();
  await expect(pending).resolves.toMatchObject({ stopReason: "stop" });
  await harness.close();
});

test("non-prompt harness methods preserve Pi fault causes", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-harness-method-fault-"));
  roots.push(root);
  const sessionFile = join(root, "session.jsonl");
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const harness = await createHarness({
    execution: new NodeExecutionEnvironment({ cwd: root, shellEnv: {} }), sessionFile,
    session: { cwd: root, id: "method-fault", createdAt: 1 }, models, model: faux.getModel(),
    systemPrompt: "Method fault test.", tools: [], context: {},
  });
  await chmod(sessionFile, 0o444);
  await expect(harness.setActiveTools([])).rejects.toThrow(new RegExp(`HarnessFault.*EACCES.*${sessionFile}`, "u"));
  await chmod(sessionFile, 0o600);
  await harness.close();
});

test("the write adapter restores byte disclosure only for success", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-harness-write-result-"));
  roots.push(root);
  const execution = new NodeExecutionEnvironment({ cwd: root, shellEnv: {} });
  const tool = createWriteTool<{ env: ExecutionEnvironment }>();
  await expect(tool.execute("success", { path: "result.txt", content: "five!" }, undefined, undefined, { env: execution }))
    .resolves.toMatchObject({ content: [{ type: "text", text: "Successfully wrote 5 bytes to result.txt" }] });
  await expect(tool.execute("failure", { path: ".", content: "must not replace the directory" }, undefined, undefined, { env: execution }))
    .rejects.toMatchObject({ name: "FileError" });
  await execution.cleanup(TODO_CONTEXT);
});

test("the adapter disables Pi's retry before Bot supplies its own retry model", async () => {
  const { faux, harness } = ordinaryHarness();
  faux.setResponses([
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider overloaded" }),
    fauxAssistantMessage("unexpected retry"),
  ]);
  let requests = 0;
  harness.beforeProviderRequest(() => { requests += 1; });
  const result = await harness.prompt("once");
  expect(result).toMatchObject({ stopReason: "error", errorMessage: "provider overloaded" });
  expect(requests).toBe(1);
  await harness.close();
});

test("the adapter preserves tool identity, context, abort, progress, details, and termination", async () => {
  const parameters = Type.Object({ value: Type.String() });
  const calls: string[] = [];
  const context = { owner: "stage" };
  const tool: HarnessTool<typeof context, typeof parameters, { echoed: string }> = {
    name: "probe", label: "Probe", description: "Exercise the tool boundary.", parameters, executionMode: "sequential",
    execute(id, params, signal, update, supplied) {
      calls.push(`${id}:${params.value}:${supplied.owner}:${String(signal?.aborted ?? true)}`);
      update?.({ content: [{ type: "text", text: "partial" }], details: { echoed: params.value } });
      return Promise.resolve({ content: [{ type: "text", text: params.value }], details: { echoed: params.value }, terminate: true });
    },
  };
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage([fauxToolCall("probe", { value: "kept" })], { stopReason: "toolUse" })]);
  const models = createModels();
  models.setProvider(faux.provider);
  const harness = createMemoryHarness({ models, model: faux.getModel(), systemPrompt: "Tool boundary test.", tools: [tool], context });
  const toolEnds: unknown[] = [];
  harness.subscribe((event) => { if (event.type === "tool_execution_end") toolEnds.push(event.result); });
  const message = await harness.prompt("probe");
  expect(message.role).toBe("assistant");
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain(":kept:stage:false");
  expect(toolEnds).toEqual([expect.objectContaining({ details: { echoed: "kept" }, terminate: true })]);
  await harness.close();
});

test("the execution adapter preserves typed filesystem and command results", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-harness-execution-"));
  roots.push(root);
  const execution = new NodeExecutionEnvironment({ cwd: root, shellEnv: { PATH: process.env["PATH"] } });
  const file = join(root, "answer.txt");
  expect(await execution.writeFile(file, "answer", TODO_CONTEXT)).toEqual({ ok: true, value: undefined });
  const read = await execution.readTextFile(file, TODO_CONTEXT);
  expect(read).toEqual({ ok: true, value: "answer" });
  const ran = await execution.exec("printf command", undefined, TODO_CONTEXT);
  expect(ran).toMatchObject({ ok: true, value: { exitCode: 0, truncation: { totalBytes: 7, truncated: false } } });
  await execution.cleanup(TODO_CONTEXT);
});

test("the real session writer opens Bot's exact format-4 path and appends a Pi transaction", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-harness-session-"));
  roots.push(root);
  const sessionFile = join(root, "record-name", "session.jsonl");
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage("written")]);
  const models = createModels();
  models.setProvider(faux.provider);
  const harness = await createHarness({
    execution: new NodeExecutionEnvironment({ cwd: root, shellEnv: {} }), sessionFile,
    session: { cwd: root, id: "exact-record-id", createdAt: 1 }, models, model: faux.getModel(),
    systemPrompt: "Writer test.", tools: [], context: {},
  });
  await harness.prompt("write one turn");
  await harness.close();
  const lines = (await readFile(sessionFile, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown> | unknown[]);
  expect(lines[0]).toMatchObject({ v: 4, kind: "header", id: "exact-record-id", storageVersion: 1, cwd: root });
  expect(lines.slice(1).some((transaction) => Array.isArray(transaction) && transaction.some((write) => typeof write === "object" && write !== null && "kind" in write && write.kind === "entry"))).toBe(true);
});

test("exact session creation never overwrites an existing record path", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-harness-exclusive-"));
  roots.push(root);
  const sessionFile = join(root, "session.jsonl");
  await writeFile(sessionFile, "owned already\n", { flag: "wx" });
  const execution = new NodeExecutionEnvironment({ cwd: root, shellEnv: {} });
  await expect(prepareHarness(execution, sessionFile, { cwd: root, id: "collision", createdAt: 1 })).rejects.toMatchObject({ code: "EEXIST" });
  await expect(readFile(sessionFile, "utf8")).resolves.toBe("owned already\n");
});

test("logical close aborts a live prompt and runs cleanup exactly once", async () => {
  const hostile = hostileModels([{ hostile: "after-abort", message: fauxAssistantMessage("stopped") }]);
  let cleanups = 0;
  const harness = createMemoryHarness({ models: hostile.models, model: hostile.model, systemPrompt: "Close test.", tools: [], context: {} }, () => { cleanups += 1; return Promise.resolve(); });
  const pending = harness.prompt("wait");
  await hostile.lifecycle.await(1, "stream started", "live prompt start");
  const first = harness.close();
  const second = harness.close();
  expect(first).toBe(second);
  await first;
  await hostile.lifecycle.await(1, "abort observed", "logical close abort");
  await pending;
  expect(cleanups).toBe(1);
});

async function invalidWorkGating() {
  const root = await mkdtemp(join(tmpdir(), "bot-harness-post-construction-"));
  roots.push(root);
  const node = stage("flows/main/01-work.md", "01-work");
  const main = flow("main", "flows/main", [node]);
  const heldAssembly = { ...assembly(main), root };
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const writer: RecordWriter = {
    runDirectory: root, recordPath: join(root, "record.jsonl"), failure: new Promise(() => undefined),
    start: () => Promise.resolve(), append: () => Promise.resolve(), drain: () => Promise.resolve(),
  };
  const read: Accepted = {
    status: "accepted", result: { exitCode: 0, lines: [] }, invocation: bareInvocation(),
    home: { options: {}, intelligences: {} }, assembly: heldAssembly, flow: main,
  };
  const model = faux.getModel();
  const slots = { PWD: root, INPUT: join(root, "input"), OUTPUT: join(root, "output.txt"), TMP: join(root, "tmp"), SKILLS: join(root, "skills") };
  const context: StageRuntimeContext = {
    assembly: heldAssembly, flow: main, origin: "root", node, identity: { stage: "01-work", retry: 1 }, mode: { kind: "stage" },
    options: { model: { value: model.id, from: "default" }, reasoning: { value: "medium", from: "default" }, timeout: { value: 10, from: "default" }, retries: { value: 0, from: "default" }, "local-context": { value: "ignore", from: "default" } },
    containers: [], inputPath: slots.INPUT, tmpPath: slots.TMP, subflowsPath: join(root, "subflows"), sessionPath: "session.jsonl", sessionFile: join(root, "session.jsonl"), slots, workdirRoot: root,
    env: { ...slots, BOT_RUN_ID: "2026-09-10T00-00-00-test" }, received: [], priorFailureInputs: [], skills: new Map(), tools: [], helpers: [], writer, clock,
  };
  return defaultGating(read, models, { sha256: "a".repeat(64), files: new Map() })(context);
}

test("a required failure after real Pi construction cleans execution exactly once", async () => {
  const cleanup = vi.spyOn(NodeExecutionEnvironment.prototype, "cleanup");
  await expect(invalidWorkGating()).rejects.toThrow("A work-mode node minted no output path: flows/main/01-work.md");
  expect(cleanup).toHaveBeenCalledTimes(1);
});

test("a post-construction cleanup failure keeps cleanup identity", async () => {
  const cleanupFailure = new Error("cleanup failure");
  const cleanup = vi.spyOn(NodeExecutionEnvironment.prototype, "cleanup").mockRejectedValueOnce(cleanupFailure);
  const rejected = invalidWorkGating().then(() => undefined, (reason: unknown) => reason);
  await expect(rejected).resolves.toBeInstanceOf(HarnessCloseError);
  await expect(rejected).resolves.toHaveProperty("cause", cleanupFailure);
  expect(cleanup).toHaveBeenCalledTimes(1);
});

function failingClose(signal?: ReturnType<typeof createRunSignal>) {
  let calls = 0;
  let closing: Promise<void> | undefined;
  return {
    wrapSession: <Session extends { close(): Promise<void> }>(session: Session): Session => ({
      ...session,
      close: () => {
        calls += closing === undefined ? 1 : 0;
        closing ??= Promise.resolve().then(() => { signal?.activate("SIGTERM"); throw new HarnessCloseError(new Error("close broke")); });
        return closing;
      },
    }),
    calls: () => calls,
  };
}

test("an unsignaled close failure leaves the stage open and faults the run", async () => {
  const node = stage("flows/main/01-work.md", "01-work");
  const main = flow("main", "flows/main", [node]);
  const close = failingClose();
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("done")]]), { wrapSession: close.wrapSession });
  const result = await run.result;
  const record = await events(run.writer.writer.recordPath);
  expect(result).toMatchObject({ exit: 2, cause: "fault", reason: "close broke" });
  expect(record.filter((event) => event["event"] === "stage_end")).toHaveLength(0);
  expect(record.at(-1)).toMatchObject({ event: "run_end", stage: "01-work", retry: 1, exit: 2, cause: "fault", reason: "close broke" });
  expect(close.calls()).toBe(1);
});

test("a close failure under an active signal keeps the signal and names cleanup", async () => {
  const node = stage("flows/main/01-work.md", "01-work");
  const main = flow("main", "flows/main", [node]);
  const signal = createRunSignal(clock);
  const close = failingClose(signal);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("done")]]), { signal, wrapSession: close.wrapSession });
  const result = await run.result;
  const record = await events(run.writer.writer.recordPath);
  expect(result).toMatchObject({ exit: 143, cause: "signal", reason: "Stage cleanup failed: close broke" });
  expect(record.filter((event) => event["event"] === "stage_end")).toHaveLength(0);
  expect(record.at(-1)).toMatchObject({ event: "run_end", stage: "01-work", retry: 1, exit: 143, cause: "signal", reason: "Stage cleanup failed: close broke" });
  expect(close.calls()).toBe(1);
});

test("a late signal drops an unrelated provider-failure reason", async () => {
  const node = stage("flows/main/01-work.md", "01-work");
  const main = flow("main", "flows/main", [node]);
  const signal = createRunSignal(clock);
  const script = () => [fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider broke" })];
  const run = await start(main, assembly(main), new Map([["main:01-work:1", script]]), {
    signal,
    wrapSession: (session) => ({
      ...session,
      close: async () => { await session.close(); signal.activate("SIGTERM"); },
    }),
  });
  const result = await run.result;
  const record = await events(run.writer.writer.recordPath);
  expect(result).toMatchObject({ exit: 143, cause: "signal" });
  expect(result).not.toHaveProperty("reason");
  expect(record.at(-1)).toMatchObject({ event: "run_end", exit: 143, cause: "signal" });
  expect(record.at(-1)).not.toHaveProperty("reason");
});
