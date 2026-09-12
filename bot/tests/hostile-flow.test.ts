// Ticket 0017 — hostile-provider sweep over the flow constructs (sequence,
// loop, parallel, choose, subflow). The flow-level invariant triple: bounded
// (manual clock only), record consistent (run_end exactly once; a stage that
// never ran leaves no events), exit honest through the whole nesting.
import { fauxAssistantMessage, fauxToolCall, type ToolResultMessage } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createMemoryHarness } from "../src/harness.ts";
import { runFlow, type GatingSession, type StageRuntimeContext } from "../src/flow.ts";
import type { GatingConfig } from "../src/gating.ts";
import type { Assembly, Branch, ChooseNode, Flow, LoopNode, Node, ParallelNode, StageNode } from "../src/model.ts";
import { runStartEvent } from "../src/record-events.ts";
import { createRecordWriter, hashBytes } from "../src/record.ts";
import { createRunSignal } from "../src/signal.ts";
import { createControlContext, type SubflowToolDetail } from "../src/tools.ts";
import { bareInvocation, bounded, hostileModels, outputOf, waitFor, type HostileStep } from "./hostile.ts";
import { manualClock, type ManualClock } from "./manual-clock.ts";

const roots: string[] = [];
let runNumber = 0;
type Script = (context: StageRuntimeContext) => HostileStep[];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function stage(path: string, name: string): StageNode {
  return { kind: "STAGE", name, path, single: true, options: {}, files: [`${name}.md`], extension: "txt", skills: [], subflows: new Map<string, Flow>() };
}

function flow(name: string, path: string, nodes: Node[]): Flow {
  return { name, path, options: {}, sequence: { path, nodes }, skills: [], subflows: new Map<string, Flow>() };
}

function assembly(main: Flow, subflows: Map<string, Flow> = new Map<string, Flow>()): Assembly {
  return { root: "/assembly", options: {}, slots: {}, skills: [], flows: new Map([[main.name, main]]), subflows, faults: [] };
}

function key(context: StageRuntimeContext): string {
  return `${context.flow.name}:${context.identity.stage}:${String(context.identity.repeat ?? 1)}`;
}

function factory(scripts: ReadonlyMap<string, Script>): (context: StageRuntimeContext) => GatingSession {
  return (context) => {
    const script = scripts.get(key(context));
    if (script === undefined) throw new Error(`No hostile script for ${key(context)}`);
    const hostile = hostileModels(script(context));
    const controls = createControlContext();
    const harness = createMemoryHarness({
      models: hostile.models, model: hostile.model,
      systemPrompt: "Hostile flow sweep.", tools: context.tools, context: controls,
    });
    const common = {
      timeoutMs: 2_000, retries: 0, cwd: context.env["PWD"] ?? "/",
      env: context.env, session: context.sessionPath, received: context.received, options: [],
    };
    let config: GatingConfig;
    if (context.mode.kind === "choose") config = { ...common, mode: "choose", alternatives: context.mode.alternatives };
    else {
      const work = { ...common, outputPath: outputOf(context), outputExtension: "txt" as const };
      config = context.mode.kind === "loop" ? { ...work, mode: "loop", question: context.mode.question } : { ...work, mode: "stage" };
    }
    return { harness, controls, config, close: () => harness.close() };
  };
}

interface Started {
  clock: ManualClock;
  recordPath: string;
  runDirectory: string;
  result: ReturnType<typeof runFlow>;
}

async function start(held: Flow, heldAssembly: Assembly, scripts: ReadonlyMap<string, Script>, origin?: "subflow"): Promise<Started> {
  const clock = manualClock();
  const root = await mkdtemp(join(tmpdir(), "bot-hostile-flow-"));
  roots.push(root);
  const runs = join(root, "runs");
  const scratch = join(root, "scratch");
  await Promise.all([mkdir(runs), mkdir(scratch)]);
  const requestPath = join(root, "request.txt");
  await writeFile(requestPath, "request bytes");
  const first = runStartEvent({
    ts: clock.timestamp(), run: `2026-08-01T10-00-${String(runNumber++).padStart(2, "0")}-feed`,
    assembly: "hostile-flow", assemblyHash: "a".repeat(64), flow: held.name,
    request: { path: "request.txt", sha256: hashBytes("request bytes"), bytes: 13, via: "stdin" },
  });
  const writer = await createRecordWriter(runs, first);
  if (writer.status !== "created") throw new Error("Temporary run name collided.");
  const signal = createRunSignal(clock);
  const result = runFlow({
    assembly: heldAssembly, flow: held, writer: writer.writer,
    request: { name: "request", extension: "txt", diskPath: requestPath, record: first.request },
    workdir: root, scratchDirectory: scratch, baseEnv: {}, slots: {}, invocation: bareInvocation(), home: { options: {}, intelligences: {} },
    metadata: { assembly: "hostile-flow", assemblyHash: "a".repeat(64), installationId: "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8" }, clock, signal, progress: () => undefined,
    ...(origin === undefined ? {} : { origin }), createGating: factory(scripts),
  });
  return { clock, recordPath: writer.writer.recordPath, runDirectory: writer.writer.runDirectory, result };
}

async function events(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

function runEndsOnce(record: Record<string, unknown>[], exit: number, cause: string): void {
  const ends = record.filter((event) => event["event"] === "run_end");
  expect(ends).toEqual([expect.objectContaining({ exit, cause })]);
}

const errorMessage = fauxAssistantMessage("", { stopReason: "error", errorMessage: "hostile provider" });

function writes(text: string): Script {
  return (context) => [async () => { await writeFile(outputOf(context), text); return fauxAssistantMessage("done"); }];
}

test("SEQUENCE: a provider fault in the first stage ends the run once; the next stage never appears", async () => {
  const main = flow("main", "flows/main", [stage("flows/main/01-a.md", "a"), stage("flows/main/02-b.md", "b")]);
  const scripts = new Map<string, Script>([["main:01-a:1", () => [errorMessage]], ["main:02-b:1", writes("never")]]);
  const run = await start(main, assembly(main), scripts);
  await expect(bounded(run.result, "sequence fault")).resolves.toMatchObject({ exit: 2, cause: "fault" });
  const record = await events(run.recordPath);
  runEndsOnce(record, 2, "fault");
  expect(record.filter((event) => event["stage"] === "02-b")).toHaveLength(0);
  expect(record.filter((event) => event["event"] === "stage_end")).toHaveLength(1);
});

test("LOOP: a provider fault inside a later repeat ends the loop and the run once", async () => {
  const cycle: LoopNode = {
    kind: "LOOP", name: "cycle", path: "flows/main/01-cycle", options: {}, skills: [], repeat: 3,
    sequence: { path: "flows/main/01-cycle", nodes: [stage("flows/main/01-cycle/01-work.md", "work")] },
  };
  const main = flow("main", "flows/main", [cycle, stage("flows/main/02-tail.md", "tail")]);
  const scripts = new Map<string, Script>([
    ["main:01-cycle/01-work:1", writes("first")],
    ["main:01-cycle/01-work:2", () => [errorMessage]],
    ["main:02-tail:1", writes("never")],
  ]);
  const run = await start(main, assembly(main), scripts);
  await expect(bounded(run.result, "loop fault")).resolves.toMatchObject({ exit: 2, cause: "fault" });
  const record = await events(run.recordPath);
  runEndsOnce(record, 2, "fault");
  expect(record.filter((event) => event["event"] === "loop_done"))
    .toEqual([expect.objectContaining({ ended_by: "fault" })]);
  expect(record.filter((event) => event["stage"] === "02-tail")).toHaveLength(0);
  const starts = record.filter((event) => event["event"] === "stage_start");
  expect(starts.map((event) => event["repeat"])).toEqual([1, 2]);
});

function branch(path: string, name: string): Branch {
  return { name, path, sequence: { path, nodes: [stage(`${path}.md`, name)] } };
}

test("PARALLEL: a hung branch is bounded by its stage timeout and parallel_done tells the truth", async () => {
  const fan: ParallelNode = {
    kind: "PARALLEL", name: "fan", path: "flows/main/01-fan", options: {}, skills: [], width: 2,
    branches: [branch("flows/main/01-fan/a", "a"), branch("flows/main/01-fan/b", "b")],
  };
  const main = flow("main", "flows/main", [fan, stage("flows/main/02-tail.md", "tail")]);
  const scripts = new Map<string, Script>([
    ["main:01-fan/a:1", () => [{ hostile: "never" }]],
    ["main:01-fan/b:1", writes("b done")],
    ["main:02-tail:1", writes("never")],
  ]);
  const run = await start(main, assembly(main), scripts);
  // Fire only after branch b has ended, so the surviving timer is branch a's.
  await waitFor(async () => (await events(run.recordPath)).some((event) => event["event"] === "stage_end" && event["stage"] === "01-fan/b") && run.clock.pending() > 0);
  run.clock.fire();
  await expect(bounded(run.result, "parallel hung branch")).resolves.toMatchObject({ exit: 1, cause: "timeout" });
  const record = await events(run.recordPath);
  runEndsOnce(record, 1, "timeout");
  const done = record.find((event) => event["event"] === "parallel_done");
  expect(done?.["branches"]).toEqual([
    { branch: "a", started: true, exit: 1, cause: "timeout" },
    { branch: "b", started: true, exit: 0, cause: "success" },
  ]);
  expect(record.filter((event) => event["stage"] === "02-tail")).toHaveLength(0);
});

test("PARALLEL: a rejected branch records the container's fault", async () => {
  const fan: ParallelNode = {
    kind: "PARALLEL", name: "fan", path: "flows/main/01-fan", options: {}, skills: [], width: 1,
    branches: [branch("flows/main/01-fan/a", "a"), branch("flows/main/01-fan/b", "b")],
  };
  const main = flow("main", "flows/main", [fan, stage("flows/main/02-tail.md", "tail")]);
  const run = await start(main, assembly(main), new Map([["main:01-fan/b:1", writes("never")]]), "subflow");
  await expect(bounded(run.result, "parallel rejection")).rejects.toThrow("No hostile script for main:01-fan/a:1");
  const record = await events(run.recordPath);
  expect(record.filter((event) => event["event"] === "parallel_done")).toEqual([expect.objectContaining({
    branches: [
      { branch: "a", started: true, exit: 2, cause: "fault" }, { branch: "b", started: false },
    ],
  })]);
  expect(record.filter((event) => event["stage"] === "02-tail")).toHaveLength(0);
});

test("CHOOSE: a chooser fault ends the run once, selects nothing, starts no branch", async () => {
  const choose: ChooseNode = {
    kind: "CHOOSE", name: "pick", path: "flows/main/01-pick", options: {}, skills: [],
    alternatives: [branch("flows/main/01-pick/x", "x"), branch("flows/main/01-pick/y", "y")],
  };
  const main = flow("main", "flows/main", [choose]);
  const scripts = new Map<string, Script>([
    ["main:01-pick:1", () => [errorMessage]],
    ["main:01-pick/x:1", writes("never")], ["main:01-pick/y:1", writes("never")],
  ]);
  const run = await start(main, assembly(main), scripts);
  await expect(bounded(run.result, "choose fault")).resolves.toMatchObject({ exit: 2, cause: "fault" });
  const record = await events(run.recordPath);
  runEndsOnce(record, 2, "fault");
  expect(record.filter((event) => event["event"] === "chose")).toHaveLength(0);
  expect(record.filter((event) => typeof event["stage"] === "string" && event["stage"].startsWith("01-pick/"))).toHaveLength(0);
});

// Ticket 0034 item 2 — choose.md: a chooser gets "`$TMP`, `$SKILLS`, and
// `$PWD`, and no `$OUTPUT`, because a choice is not an output." The selected
// branch's stage still gets its own $OUTPUT.
test("CHOOSE: the chooser receives no $OUTPUT slot, env entry, or minted path", async () => {
  const pick: ChooseNode = {
    kind: "CHOOSE", name: "pick", path: "flows/main/01-pick", options: {}, skills: [],
    alternatives: [branch("flows/main/01-pick/x", "x"), branch("flows/main/01-pick/y", "y")],
  };
  const main = flow("main", "flows/main", [pick]);
  let chooser: StageRuntimeContext | undefined;
  let chosen: StageRuntimeContext | undefined;
  const scripts = new Map<string, Script>([
    ["main:01-pick:1", (context) => {
      chooser = context;
      return [fauxAssistantMessage([fauxToolCall("select", { name: "x", reason: "first" })], { stopReason: "toolUse" })];
    }],
    ["main:01-pick/x:1", (context) => { chosen = context; return writes("picked")(context); }],
  ]);
  const run = await start(main, assembly(main), scripts);
  await expect(bounded(run.result, "choose without $OUTPUT")).resolves.toMatchObject({ exit: 0, cause: "success" });
  expect(chooser === undefined ? undefined : "OUTPUT" in chooser.slots).toBe(false);
  expect(chooser?.env["OUTPUT"]).toBeUndefined();
  expect(chooser?.outputPath).toBeUndefined();
  expect(typeof chosen?.outputPath).toBe("string");
  expect(chosen?.env["OUTPUT"]).toBe(chosen?.outputPath);
});

test("SUBFLOW: a malformed subflow batch feeds back; the record shows only what ran", async () => {
  const child = flow("child", "subflows/child", [stage("subflows/child/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  const scripts = new Map<string, Script>([
    ["child:01-answer:1", writes("never")],
    ["main:01-parent:1", (context) => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "child" }] })], { stopReason: "toolUse" }),
      async () => { await writeFile(outputOf(context), "recovered"); return fauxAssistantMessage("done"); },
    ]],
  ]);
  const run = await start(main, assembly(main, new Map([["child", child]])), scripts);
  await expect(bounded(run.result, "malformed subflow batch")).resolves.toMatchObject({ exit: 0, cause: "success" });
  const record = await events(run.recordPath);
  runEndsOnce(record, 0, "success");
  expect(record.filter((event) => event["event"] === "subflow_call")).toHaveLength(0);
  expect(record.filter((event) => event["stage"] === "01-parent" && event["event"] === "stage_end")).toHaveLength(1);
});

test("SUBFLOW: one unreadable input-file is that call's outcome; the siblings' events survive", async () => {
  const child = flow("child", "subflows/child", [stage("subflows/child/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  let details: SubflowToolDetail[] | undefined;
  const scripts = new Map<string, Script>([
    ["child:01-answer:1", writes("answered")],
    ["main:01-parent:1", (context) => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [
        { flow: "child", input: "first" },
        { flow: "child", "input-file": "$TMP/missing.txt" },
        { flow: "child", input: "third" },
      ] })], { stopReason: "toolUse" }),
      async (prompt) => {
        const results = prompt.messages.filter(
          (message): message is ToolResultMessage<SubflowToolDetail[]> => message.role === "toolResult",
        );
        details = results[0]?.details;
        await writeFile(outputOf(context), "carried on");
        return fauxAssistantMessage("done");
      },
    ]],
  ]);
  const run = await start(main, assembly(main, new Map([["child", child]])), scripts);
  await expect(bounded(run.result, "subflow bad sibling")).resolves.toMatchObject({ exit: 0, cause: "success" });
  const record = await events(run.recordPath);
  runEndsOnce(record, 0, "success");
  // Every call is one event in the parent's record (subflow.md): the call
  // whose input never became bytes appears with started:false, its reason,
  // and no input field — bytes that never existed are never hashed.
  expect(record.filter((event) => event["event"] === "subflow_call")).toEqual([
    expect.objectContaining({ call: 1, flow: "child", started: true, exit: 0, cause: "success", input: expect.objectContaining({ text: "first" }) as unknown }),
    expect.objectContaining({ call: 2, flow: "child", started: false, depth: 1, reason: expect.stringContaining("ENOENT") as unknown }),
    expect.objectContaining({ call: 3, flow: "child", started: true, exit: 0, cause: "success", input: expect.objectContaining({ text: "third" }) as unknown }),
  ]);
  const neverStarted = record.find((event) => event["event"] === "subflow_call" && event["call"] === 2);
  expect(neverStarted).not.toHaveProperty("input");
  expect(neverStarted).not.toHaveProperty("exit");
  expect(details).toEqual([
    expect.objectContaining({ call: 1, started: true, exit: 0, cause: "success" }),
    expect.objectContaining({ call: 2, started: false, reason: expect.stringContaining("ENOENT") as unknown }),
    expect.objectContaining({ call: 3, started: true, exit: 0, cause: "success" }),
  ]);
});

test("SUBFLOW: a child provider fault is recorded honestly in both records and the parent goes on", async () => {
  const child = flow("child", "subflows/child", [stage("subflows/child/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  const scripts = new Map<string, Script>([
    ["child:01-answer:1", () => [errorMessage]],
    ["main:01-parent:1", (context) => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "child", input: "try this" }] })], { stopReason: "toolUse" }),
      async () => { await writeFile(outputOf(context), "carried on"); return fauxAssistantMessage("done"); },
    ]],
  ]);
  const run = await start(main, assembly(main, new Map([["child", child]])), scripts);
  await expect(bounded(run.result, "subflow child fault")).resolves.toMatchObject({ exit: 0, cause: "success" });
  const record = await events(run.recordPath);
  runEndsOnce(record, 0, "success");
  expect(record).toContainEqual(expect.objectContaining({ event: "subflow_call", flow: "child", started: true, exit: 2, cause: "fault" }));
  const childRecord = await events(join(run.runDirectory, "stages/01-parent/1/1/subflows/1/record.jsonl"));
  runEndsOnce(childRecord, 2, "fault");
});
