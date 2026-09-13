// The synthetic flow harness: a faux-backed `runFlow` driven by a map of
// scripts, one per stage attempt, keyed `flow:stage:repeat`.
//
// Ticket 0063 items 15/16. This scaffolding moved out of `flow.test.ts` for
// reuse by the flow test family. It moved here verbatim, the same move
// `assembly-home.ts` made for `cli-assembly-management.test.ts`. No behaviour
// changed with the move; every function is byte-for-byte what it was, except
// `start`'s new optional `clock`.
import { createModels, fauxAssistantMessage, fauxProvider, type FauxResponseStep } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHarness, NodeExecutionEnvironment } from "../src/harness.ts";
import { runFlow, type GatingSession, type RunFlowInput, type StageRuntimeContext } from "../src/flow.ts";
import type { GatingConfig } from "../src/gating.ts";
import type { Assembly, Flow, Node, StageNode } from "../src/model.ts";
import type { DriverClock, Executable } from "../src/process.ts";
import { runStartEvent } from "../src/record-events.ts";
import { createRecordWriter, hashBytes, type RecordWriter } from "../src/record.ts";
import { createRunSignal, type RunSignal } from "../src/signal.ts";
import { createControlContext } from "../src/tools.ts";
import { bareInvocation, outputOf } from "./hostile.ts";

/** Temporary roots the calling test file removes in its own `afterEach`. */
export const roots: string[] = [];
let runNumber = 0;

/** The ordinary real clock, for every test that is not about time. */
export const clock: DriverClock = {
  milliseconds: () => performance.now(), timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

export type Script = (context: StageRuntimeContext, signal: RunSignal) => FauxResponseStep[];

export function stage(path: string, name: string, subflows: Map<string, Flow> = new Map<string, Flow>()): StageNode {
  return { kind: "STAGE", name, path, single: true, options: {}, files: [`${name}.md`], extension: "txt", skills: [], subflows };
}

export function flow(name: string, path: string, nodes: Node[], extra: Partial<Pick<Flow, "subflows" | "maxDepth">> = {}): Flow {
  return { name, path, options: {}, sequence: { path, nodes }, skills: [], subflows: extra.subflows ?? new Map<string, Flow>(), ...(extra.maxDepth === undefined ? {} : { maxDepth: extra.maxDepth }) };
}

export function assembly(main: Flow, subflows: Map<string, Flow> = new Map<string, Flow>(), slots: Record<string, string> = {}): Assembly {
  return { root: "/assembly", options: {}, slots, skills: [], flows: new Map([[main.name, main]]), subflows, faults: [] };
}

function key(context: StageRuntimeContext): string {
  return `${context.flow.name}:${context.identity.stage}:${String(context.identity.repeat ?? 1)}`;
}

function configuredGates(gates: ReadonlyMap<string, readonly Executable[]>, context: StageRuntimeContext): { gates?: readonly Executable[] } {
  const found = gates.get(key(context));
  return found === undefined ? {} : { gates: found };
}

function wrappedSession(session: GatingSession, wrap?: (session: GatingSession) => GatingSession): GatingSession {
  return wrap === undefined ? session : wrap(session);
}

function factory(
  scripts: ReadonlyMap<string, Script>, signal: RunSignal, hooks: ReadonlyMap<string, Executable> = new Map(),
  gates: ReadonlyMap<string, readonly Executable[]> = new Map(), timeouts: ReadonlyMap<string, number> = new Map(), retries: ReadonlyMap<string, number> = new Map(),
  wrapSession?: (session: GatingSession) => GatingSession,
): (context: StageRuntimeContext) => Promise<GatingSession> {
  return async (context) => {
    const script = scripts.get(key(context));
    if (script === undefined) throw new Error(`No faux script for ${key(context)}`);
    const faux = fauxProvider({ tokensPerSecond: 10_000 });
    faux.setResponses(script(context, signal));
    const models = createModels();
    models.setProvider(faux.provider);
    const controls = createControlContext();
    const execution = new NodeExecutionEnvironment({ cwd: context.env["PWD"] ?? "/", shellEnv: context.env });
    const harness = await createHarness({
      execution, sessionFile: context.sessionFile, session: { cwd: context.env["PWD"] ?? "/", id: key(context), createdAt: Date.parse(context.clock.timestamp()) },
      models, model: faux.getModel(), systemPrompt: "Synthetic flow test.", tools: context.tools, context: controls,
    });
    const common = {
      prompt: "Do the work.", timeoutMs: timeouts.get(key(context)) ?? 2_000,
      retries: retries.get(key(context)) ?? 0, cwd: context.env["PWD"] ?? "/",
      env: context.env, session: context.sessionPath, received: context.received, options: [],
    };
    let config: GatingConfig;
    if (context.mode.kind === "choose") {
      config = { ...common, mode: "choose", alternatives: context.mode.alternatives };
    } else {
      const hook = hooks.get(key(context));
      const work = {
        ...common, outputPath: outputOf(context), outputExtension: "txt" as const,
        ...configuredGates(gates, context),
        ...(hook === undefined ? {} : { hooks: { failure: hook } }),
      };
      config = context.mode.kind === "loop"
        ? { ...work, mode: "loop", question: context.mode.question }
        : { ...work, mode: "stage" };
    }
    const session = { harness, controls, config, close: () => harness.close() };
    return wrappedSession(session, wrapSession);
  };
}

export interface Started {
  root: string;
  signal: RunSignal;
  writer: Awaited<ReturnType<typeof createRecordWriter>> & { status: "created" };
  result: ReturnType<typeof runFlow>;
}

export interface StartOptions {
  slots?: Record<string, string>;
  hooks?: ReadonlyMap<string, Executable>;
  gates?: ReadonlyMap<string, readonly Executable[]>;
  timeouts?: ReadonlyMap<string, number>;
  retries?: ReadonlyMap<string, number>;
  clock?: DriverClock;
  observeTmpSample?: (sample: Promise<number>) => void;
  signal?: RunSignal;
  wrapWriter?: (writer: RecordWriter) => RecordWriter;
  compromised?: Promise<never>;
  machineryStop?: RunFlowInput["machineryStop"];
  readOutput?: RunFlowInput["readOutput"];
  wrapSession?: (session: GatingSession) => GatingSession;
}

function optionalRunInput(options: StartOptions): Partial<RunFlowInput> {
  return {
    ...(options.observeTmpSample === undefined ? {} : { observeTmpSample: options.observeTmpSample }),
    ...(options.compromised === undefined ? {} : { compromised: options.compromised }),
    ...(options.machineryStop === undefined ? {} : { machineryStop: options.machineryStop }),
    ...(options.readOutput === undefined ? {} : { readOutput: options.readOutput }),
  };
}

export async function start(
  held: Flow, heldAssembly: Assembly, scripts: ReadonlyMap<string, Script>,
  options: StartOptions = {},
): Promise<Started> {
  // Ticket 0063 item 15: a run may be given a clock of its own. Every stage
  // budget here is enforced through it (`turns.ts` arms the guard on
  // `createAgentClock(input.clock)`), so a test with millisecond budgets can
  // hand in `manualClock()` and stop racing the machine.
  const driver = options.clock ?? clock;
  const root = await mkdtemp(join(tmpdir(), "bot-flow-test-"));
  roots.push(root);
  const runs = join(root, "runs");
  const scratch = join(root, "scratch");
  await Promise.all([mkdir(runs), mkdir(scratch)]);
  const requestPath = join(root, "request.txt");
  await writeFile(requestPath, "request bytes");
  const first = runStartEvent({
    ts: driver.timestamp(), run: `2026-07-31T12-30-${String(runNumber++).padStart(2, "0")}-beef`,
    assembly: "flow-test", assemblyHash: "a".repeat(64), flow: held.name,
    request: { path: "request.txt", sha256: hashBytes("request bytes"), bytes: 13, via: "stdin" },
  });
  const writer = await createRecordWriter(runs, first);
  if (writer.status !== "created") throw new Error("Temporary run name collided.");
  await writeFile(join(writer.writer.runDirectory, "request.txt"), "request bytes");
  const signal = options.signal ?? createRunSignal(driver);
  const flowWriter = options.wrapWriter?.(writer.writer) ?? writer.writer;
  const result = runFlow({
    assembly: heldAssembly, flow: held, writer: flowWriter,
    request: { name: "request", extension: "txt", diskPath: requestPath,
      record: { path: first.request.path, sha256: first.request.sha256 } },
    workdir: root, scratchDirectory: scratch, baseEnv: {}, slots: options.slots ?? {}, invocation: bareInvocation(), home: { options: {}, intelligences: {} },
    metadata: { assembly: "flow-test", assemblyHash: "a".repeat(64), installationId: "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8" }, clock: driver, signal,
    ...optionalRunInput(options),
    // The harness reads the record, never the display: progress goes nowhere here.
    progress: () => undefined,
    createGating: factory(scripts, signal, options.hooks, options.gates, options.timeouts, options.retries, options.wrapSession),
  });
  return { root, signal, writer, result };
}

export async function events(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function writes(text: string): Script {
  return (context) => [async () => { await writeFile(outputOf(context), text); return fauxAssistantMessage("done"); }];
}
