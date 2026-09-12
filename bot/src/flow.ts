import { cp, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { createAgentClock } from "./clock.ts";
import { scrubCredentialEnvironment } from "./credentials.ts";
import { cancelled, runChoose, runLoop, runParallel } from "./containers.ts";
import { runFanout } from "./fanout.ts";
import type {
  Execution, FlowResult, FlowSource, GatingMode, GatingSession, NodeResult, RunFlowInput, StageRuntimeContext,
} from "./execution.ts";
import { runGating, type GatingResult } from "./gating.ts";
import { HarnessCloseError } from "./harness.ts";
import { attemptKey, createTemporaryHandle, removeTemporaryHandle, scratchAttempt } from "./invocation.ts";
import { admittedSkills } from "./local-context.ts";
import { DEFAULT_TMP_MAX_BYTES, OWNER_ONLY, faultReason, machineryFault, stagePath, visible, type ChooseNode, type Flow, type Node, type Sequence, type StageNode } from "./model.ts";
import { childInvocation, resolveNodeOptions, type ResolvedOptions } from "./options.ts";
import { directorySize } from "./inspection.ts";
import { removeOwnedTree } from "./owned-removal.ts";
import { closeHeldSources, materializeSources } from "./source-materialization.ts";
import { identityOf } from "./readings.ts";
import { runEndEvent, tmpTeardownEvent, type StageIdentity } from "./record-events.ts";
import type { RecordWriter } from "./record.ts";
import { declaredSlots, workdirRoot } from "./runtime-slots.ts";
import { visibleSkills } from "./skills.ts";
import {
  runSubflowBatch,
  scopedSubflows,
  type ChildRunInput,
} from "./subflow-runtime.ts";
import { createControlTools, createSubflowTool } from "./tools.ts";
import { stageWorkdir } from "./workdir.ts";
export type {
  FlowResult, GatingSession, RunFlowInput, StageRuntimeContext,
} from "./execution.ts";

function identity(node: StageNode | ChooseNode, execution: Execution): StageIdentity {
  return {
    stage: stagePath(node, execution.input.flow),
    ...(execution.repeat === undefined ? {} : { repeat: execution.repeat }),
    retry: 1,
  };
}

async function prepareStage(
  execution: Execution, held: StageIdentity, sources: readonly FlowSource[], node: StageNode | ChooseNode, scope: ReadonlyMap<string, Flow>, options: ResolvedOptions, workdir: string,
): Promise<{ inputPath: string; outputPath: string | undefined; tmpPath: string; subflowsPath: string; skillsPath: string; skills: ReturnType<typeof visibleSkills>; slots: Record<string, string>; backingSlots: Record<string, string> }> {
  const scratch = scratchAttempt(execution.input.scratchDirectory, attemptKey(held.stage, held.repeat));
  const inputPath = join(scratch, "input");
  // tmp: flow shares one temp; a subflow child consults its OWN FLOW.md over its own scratch root (slots.md).
  const tmpPath = execution.input.flow.tmp === "flow" ? join(execution.input.scratchDirectory, "shared") : join(scratch, "tmp");
  const outputPath = node.kind === "STAGE" ? join(scratch, `output.${node.extension}`) : undefined;
  // `answers` (subflow.md), not `subflows`: the slot is a name the agent is
  // given, the directory is one it can read.
  const subflowsPath = join(scratch, "answers");
  const skillsPath = join(scratch, "skills");
  // Owner-only, like the home and every run directory (home.md, ticket 0140):
  // the same prompts, `$INPUT` copies, outputs and skills sat world-readable
  // under the cache while the run's own copies were 0700. `recursive` puts the
  // mode on every level this makes — the scratch root included, which is where
  // the tree is born — and the doors are the whole lock, so nothing beneath one
  // is moded separately and a tree that already stands keeps what it has.
  await Promise.all([inputPath, tmpPath, subflowsPath, skillsPath].map((path) => mkdir(path, { recursive: true, mode: OWNER_ONLY })));
  const tmpHandle = await createTemporaryHandle(tmpPath);
  const skills = visibleSkills(execution.input.assembly, execution.input.flow, execution.containers, node, admittedSkills(options["local-context"]?.value, workdir));
  const prepared = await Promise.allSettled([
    materializeSources(execution.input.writer.runDirectory, inputPath, sources),
    // One visibility rule, at every depth (graph.md): a dot entry is not hashed,
    // so it is not materialized either — `$SKILLS` may not hold bytes the run's
    // `assembly_hash` does not cover. The filter sees each entry's own path, so
    // the skill's root (`.claude/skills/x` is a legal source) is judged by its
    // own name, and a rejected directory is never descended.
    ...[...skills].map(([name, skill]) => cp(skill.directory, join(skillsPath, name), {
      recursive: true, filter: (entry) => visible(basename(entry)),
    })),
  ]);
  const failed = prepared.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  const backingSlots: Record<string, string> = {
    ...declaredSlots(execution.input),
    INPUT: inputPath, ...(outputPath === undefined ? {} : { OUTPUT: outputPath }),
    TMP: tmpPath, TMPDIR: tmpPath, SKILLS: skillsPath,
    ...(scope.size === 0 ? {} : { SUBFLOWS: subflowsPath }), PWD: workdir,
  };
  const slots = { ...backingSlots, TMP: tmpHandle, TMPDIR: tmpHandle };
  return { inputPath, outputPath, tmpPath, subflowsPath, skillsPath, skills, slots, backingSlots };
}

function executeChild(execution: Execution, child: ChildRunInput, workdir: string): Promise<FlowResult> {
  const { skip: _skip, initialSources: _initialSources, readOutput, ...parent } = execution.input;
  const request: FlowSource = { name: "request", extension: child.request.extension, diskPath: child.request.diskPath,
    record: { path: child.request.path, sha256: child.request.sha256 } };
  return executeRun({
    ...parent, flow: child.flow, writer: child.writer, request, workdir,
    ...(execution.input.workdirRoot === undefined ? {} : { workdirRoot: execution.input.workdirRoot }),
    scratchDirectory: child.scratchDirectory, depth: child.depth, callChainDepth: child.callChainDepth,
    compromised: child.compromised, localStop: child.localStop, origin: "subflow",
    ...(child.readFinalOutput && readOutput !== undefined ? { readOutput } : {}),
  });
}

function gatingOutputs(result: GatingResult, node: StageNode | ChooseNode, writer: RecordWriter): FlowSource[] {
  if (result.output === undefined || node.kind !== "STAGE") return [];
  return [{
    name: node.name, extension: node.extension,
    diskPath: join(writer.runDirectory, ...result.output.path.split("/")), record: result.output,
  }];
}

function rejected(reason: unknown): Error { return reason instanceof Error ? reason : new Error("The run failed with a non-Error value.", { cause: reason }); }

const TMP_SAMPLE_MS = 250;

function monitorTemporaryStorage(path: string, ceiling: number, clock: Execution["input"]["clock"], session: GatingSession, observe?: (sample: Promise<number>) => void): () => void {
  let stopped = false;
  let timer: unknown;
  const stop = (): void => {
    stopped = true;
    if (timer !== undefined) clock.clearTimeout(timer);
  };
  const fault = (bytes: number): void => {
    if (stopped) return;
    stop();
    session.controls.fault = { reason: `$TMP exceeded its ${String(ceiling)} bytes ceiling: ${String(bytes)} bytes.` };
    void session.harness.abort().then(undefined, () => undefined);
  };
  const sample = (): void => {
    const measurement = directorySize(path);
    observe?.(measurement);
    void measurement.then((bytes) => {
      if (stopped) return;
      if (bytes > ceiling) {
        fault(bytes);
        return;
      }
      timer = clock.setTimeout(sample, TMP_SAMPLE_MS);
    }, () => {
      if (!stopped) timer = clock.setTimeout(sample, TMP_SAMPLE_MS);
    });
  };
  timer = clock.setTimeout(sample, TMP_SAMPLE_MS);
  return stop;
}

// A child whose setup fails before it reaches an outcome remains the rejected
// tool call its parent records; recognized child machinery faults already seal.
function escapesSubflow(input: RunFlowInput, reason: unknown): boolean { return input.origin === "subflow" && machineryFault(reason) === undefined; }
function stageFault(execution: Execution, reason: unknown, held: StageIdentity | undefined): NodeResult {
  const signal = cancelled(execution);
  const closeReason = reason instanceof HarnessCloseError ? reason.cause : undefined;
  if (signal !== undefined) return { ...signal, ...(closeReason === undefined ? {} : { reason: `Stage cleanup failed: ${faultReason(closeReason)}` }), ...(held === undefined ? {} : { terminalStage: { ...held } }) };
  return { exit: 2, cause: "fault", reason: faultReason(closeReason ?? reason), outputs: [], ...(held === undefined ? {} : { terminalStage: { ...held } }) };
}
async function runMonitoredGating(execution: Execution, held: StageIdentity, agentClock: ReturnType<typeof createAgentClock>, path: string, session: GatingSession): Promise<GatingResult> {
  const stopMonitoring = monitorTemporaryStorage(path, execution.input.assembly.tmpMaxBytes ?? DEFAULT_TMP_MAX_BYTES, execution.input.clock, session, execution.input.observeTmpSample);
  const localStop = execution.input.localStop;
  const fault = (): { reason: unknown } | undefined => localStop?.failure() ?? execution.input.machineryStop?.failure();
  try {
    return await runGating({ ...session, writer: execution.input.writer, identity: held, clock: execution.input.clock, agentClock,
      signal: { abort: localStop?.abort ?? execution.input.signal.abort, exit: () => execution.input.signal.exitCode(), groups: execution.input.signal.groups,
        ...(localStop === undefined && execution.input.machineryStop === undefined ? {} : { fault }) } });
  } finally {
    stopMonitoring();
    await session.close();
  }
}

function runGatingNode(execution: Execution, node: StageNode | ChooseNode, mode: GatingMode, sources: FlowSource[]): Promise<NodeResult> {
  const held = identity(node, execution); let ended = false;
  const workdir = stageWorkdir(execution.input.workdir, execution.input.workdirRoot ?? execution.input.workdir, node);
  return runHeldGatingNode(execution, node, mode, sources, held, workdir, () => { ended = true; }).then(
    (result) => result.cause === "signal" ? { ...result, terminalStage: { ...held } } : result,
    (reason: unknown) => escapesSubflow(execution.input, reason) ? Promise.reject(rejected(reason)) : stageFault(execution, reason, ended ? undefined : held),
  );
}

// Teardown failures after settlement are diagnostics. Preserve the settled
// result and report the cleanup failure instead of displacing the ending.
function teardownTemporary(writer: RecordWriter, timestamp: () => string, identity: StageIdentity | undefined, tmpPath: string): Promise<void> {
  return removeTemporaryHandle(tmpPath).then(() => removeOwnedTree(tmpPath, true)).then(
    () => undefined,
    (reason: unknown) => writer.append(tmpTeardownEvent({ ts: timestamp(), ...(identity === undefined ? {} : { identity }), reason: faultReason(reason) })),
  );
}

async function runHeldGatingNode(
  execution: Execution, node: StageNode | ChooseNode, mode: GatingMode, sources: FlowSource[], held: StageIdentity, workdir: string, ended: () => void,
): Promise<NodeResult> {
  const tmpPath = join(scratchAttempt(execution.input.scratchDirectory, attemptKey(held.stage, held.repeat)), "tmp");
  try {
    return await runHeldGatingNodeWork(execution, node, mode, sources, held, workdir, ended);
  } finally {
    if (execution.input.flow.tmp !== "flow") {
      await teardownTemporary(execution.input.writer, () => execution.input.clock.timestamp(), held, tmpPath);
    }
  }
}

async function runHeldGatingNodeWork(
  execution: Execution, node: StageNode | ChooseNode, mode: GatingMode, sources: FlowSource[], held: StageIdentity, workdir: string, ended: () => void,
): Promise<NodeResult> {
  // The run saying where it has got to, in the identity `bot show` prints and
  // the plan renders: one set of strings, no display name minted beside them
  // (invariant 20), which is why the spelling is readings.ts's own.
  execution.input.progress(identityOf({ ...held }));
  const scope = scopedSubflows(execution.input.assembly.subflows, execution.input.flow, node.kind === "STAGE" ? node : undefined, execution.depth, execution.callChainDepth);
  // Resolved once, where the stage runs: the prompt, the machinery, and the
  // record's ladder all read the same eight rungs (invocation.md).
  const run = execution.input;
  const options = resolveNodeOptions(run.origin === "subflow" ? childInvocation(run.invocation) : run.invocation, run.assembly, run.flow, run.home, node, execution.containers.map((each) => each.options)).options;
  const paths = await prepareStage(execution, held, sources, node, scope, options, workdir);
  const agentClock = createAgentClock(execution.input.clock);
  const tools = createControlTools(paths.tmpPath);
  const counter = { value: 0 };
  if (scope.size > 0) tools.push(createSubflowTool((calls, toolSignal) => runSubflowBatch({
    calls, scope, currentFlow: execution.input.flow, currentDepth: execution.depth, currentCallChainDepth: execution.callChainDepth, identity: held, writer: execution.input.writer,
    answersDirectory: paths.subflowsPath, scratchDirectory: execution.input.scratchDirectory, metadata: execution.input.metadata,
    slots: paths.backingSlots, workdirRoot: workdirRoot(execution), clock: agentClock,
    monotonic: () => execution.input.clock.milliseconds(), signal: execution.input.signal, toolSignal,
    ...(execution.input.localStop === undefined ? {} : { callerStop: execution.input.localStop }), counter,
    runChild: (child) => executeChild(execution, child, paths.slots["PWD"] ?? execution.input.workdir),
  })));
  // BOT_HOME is the runtime's own variable, never the agent's to see (home.md).
  const { BOT_HOME: _scrubbed, ...callerEnv } = execution.input.baseEnv;
  const env: NodeJS.ProcessEnv = { ...scrubCredentialEnvironment(callerEnv), ...paths.backingSlots, BOT_RUN_ID: basename(execution.input.writer.runDirectory) };
  const received = sources.map((source) => ({ name: `${source.name}.${source.extension}`, ...source.record }));
  const priorFailureInputs = sources.filter((source) => source.role === "prior-failure")
    .map((source) => `${source.name}.${source.extension}`);
  const sessionPath = ["stages", ...held.stage.split("/"), String(held.repeat ?? 1), "session.jsonl"].join("/");
  const sessionFile = join(execution.input.writer.runDirectory, ...sessionPath.split("/"));
  const context: StageRuntimeContext = { assembly: execution.input.assembly, flow: execution.input.flow, origin: execution.input.origin ?? "root", node, identity: held,
    mode, options, containers: execution.containers, inputPath: paths.inputPath, ...(paths.outputPath === undefined ? {} : { outputPath: paths.outputPath }),
    tmpPath: paths.tmpPath, subflowsPath: paths.subflowsPath, sessionPath, sessionFile, slots: paths.slots, workdirRoot: workdirRoot(execution), env, received, priorFailureInputs,
    skills: paths.skills, tools, helpers: [...scope.values()], writer: execution.input.writer, clock: execution.input.clock };
  const result = await runMonitoredGating(execution, held, agentClock, paths.tmpPath, await execution.input.createGating(context));
  ended();
  const outputs = gatingOutputs(result, node, execution.input.writer);
  return { exit: result.exit, cause: result.cause, outputs, ...(result.reason === undefined ? {} : { reason: result.reason }),
    ...(result.continuation === undefined ? {} : { continuation: result.continuation }), ...(result.selection === undefined ? {} : { selection: result.selection }) };
}

async function runNode(execution: Execution, node: Node, sources: FlowSource[], mode?: GatingMode): Promise<NodeResult> {
  switch (node.kind) {
    case "STAGE":
      return runGatingNode(execution, node, mode ?? { kind: "stage" }, sources);
    case "LOOP":
      return runLoop(execution, node, sources);
    case "PARALLEL":
      return runParallel(execution, node, sources);
    case "CHOOSE":
      return runChoose(execution, node, sources);
    case "FANOUT":
      return runFanout(execution, node, sources, (child) => executeChild(execution, child, execution.input.workdir));
  }
}

async function runSequence(execution: Execution, sequence: Sequence, initial: FlowSource[], tailMode?: GatingMode): Promise<NodeResult> {
  let sources = initial;
  for (let index = 0; index < sequence.nodes.length; index += 1) {
    const stopped = cancelled(execution);
    if (stopped !== undefined) {
      await closeHeldSources(sources);
      return stopped;
    }
    const node = sequence.nodes[index];
    if (node === undefined) continue;
    const mode = index === sequence.nodes.length - 1 ? tailMode : undefined;
    const result = await runNode(execution, node, sources, mode);
    if (result.exit !== 0) return result;
    sources = result.outputs;
    if (result.continuation !== undefined || result.selection !== undefined) return { ...result, outputs: sources };
  }
  return { exit: 0, cause: "success", outputs: sources };
}

function flowFault(input: RunFlowInput, reason: unknown): NodeResult {
  const exit = input.signal.exitCode(); return exit === undefined ? { exit: 2, cause: "fault", reason: faultReason(reason), outputs: [] } : { exit, cause: "signal", outputs: [] };
}
function resultOutput(result: NodeResult): FlowResult["output"] {
  const output = result.outputs[0]; return output === undefined || (output.extension !== "json" && output.extension !== "md" && output.extension !== "txt") ? undefined : { ...output, extension: output.extension };
}
type TerminalWork = Pick<FlowResult, "output" | "outputBytes"> & { result: NodeResult };
function readOutput(input: RunFlowInput, result: NodeResult): Promise<TerminalWork> {
  const output = result.exit === 0 ? resultOutput(result) : undefined;
  return output === undefined || input.readOutput === undefined ? Promise.resolve({ result, ...(output === undefined ? {} : { output }) }) : input.readOutput(output).then((outputBytes) => ({ result, output, outputBytes }), (reason: unknown) => ({ result: flowFault(input, reason) }));
}
function signalledAt(held: TerminalWork, exit: number | undefined): TerminalWork {
  const cleanupReason = held.result.cause === "signal" && held.result.reason?.startsWith("Stage cleanup failed: ") === true
    ? held.result.reason
    : undefined;
  return exit === undefined ? held : { result: { exit, cause: "signal", outputs: [], ...(cleanupReason === undefined ? {} : { reason: cleanupReason }), ...(held.result.terminalStage === undefined ? {} : { terminalStage: held.result.terminalStage }) } };
}
function sequenceResult(input: RunFlowInput, execution: Execution): Promise<NodeResult> {
  const sequence = input.skip === undefined ? input.flow.sequence : { ...input.flow.sequence, nodes: input.flow.sequence.nodes.slice(input.skip) };
  return runSequence(execution, sequence, input.initialSources ?? [input.request]).then((result) => result, (reason: unknown) => escapesSubflow(input, reason) ? Promise.reject(rejected(reason)) : flowFault(input, reason));
}
async function compromiseRace(input: RunFlowInput, sequence: Promise<NodeResult>): Promise<NodeResult> {
  type Outcome = { kind: "result"; result: NodeResult } | { kind: "rejected"; reason: unknown } | { kind: "fault"; reason: unknown };
  const stop = (reason: unknown): Outcome => {
    if (input.localStop === undefined) input.signal.cancel();
    else input.localStop.fail(reason);
    return { kind: "fault", reason };
  };
  const settled = sequence.then<Outcome, Outcome>(
    (result) => ({ kind: "result", result }),
    (reason: unknown) => ({ kind: "rejected", reason }),
  );
  const outcome = await Promise.race<Outcome>([
    settled,
    input.writer.failure.then(stop),
    ...(input.compromised === undefined ? [] : [input.compromised.then<never, Outcome>(undefined, stop)]),
  ]);
  const failure = input.localStop?.failure();
  if (outcome.kind === "fault") {
    await settled;
    return flowFault(input, failure?.reason ?? outcome.reason);
  }
  if (failure !== undefined) {
    await settled;
    return flowFault(input, failure.reason);
  }
  if (outcome.kind === "rejected") throw rejected(outcome.reason);
  return outcome.result;
}

type WriterOutcome = { status: "written" } | { status: "failed"; reason: unknown };
function writerOutcome(writer: RecordWriter, operation: Promise<void>): Promise<WriterOutcome> {
  const failed = writer.failure.then((reason) => ({ status: "failed" as const, reason }));
  const written = operation.then(
    () => ({ status: "written" as const }),
    () => failed,
  );
  return Promise.race([written, failed]);
}
function flowResult(result: NodeResult, output?: FlowResult["output"], outputBytes?: Buffer): FlowResult {
  return { exit: result.exit, cause: result.cause, ...(result.reason === undefined ? {} : { reason: result.reason }),
    ...(output === undefined ? {} : { output }), ...(outputBytes === undefined ? {} : { outputBytes }) };
}

function cleanupFault(held: TerminalWork, exit: number | undefined, reason: unknown): TerminalWork {
  const stopped = signalledAt(held, exit);
  const message = `Final process cleanup failed: ${faultReason(reason)}`;
  if (stopped.result.cause === "signal") return { result: { ...stopped.result, reason: message } };
  return { result: { exit: 2, cause: "fault", reason: message, outputs: [],
    ...(held.result.terminalStage === undefined ? {} : { terminalStage: held.result.terminalStage }) } };
}

async function settleRoot(input: RunFlowInput, held: TerminalWork): Promise<TerminalWork> {
  const settled = await input.signal.cleanup();
  return settled.cleanupFailure === undefined
    ? signalledAt(held, settled.exit)
    : cleanupFault(held, settled.exit, settled.cleanupFailure.reason);
}

function writerFault(input: RunFlowInput, reason: unknown): FlowResult {
  return { ...flowResult({ exit: 2, cause: "fault", reason: faultReason(reason), outputs: [] }),
    ...(input.origin === "subflow" ? { recordComplete: false as const } : {}) };
}

function applySignalSettlement(
  input: RunFlowInput, held: TerminalWork, ownsRootCleanup: boolean, settled: Awaited<ReturnType<RunFlowInput["signal"]["drain"]>>,
): TerminalWork {
  if (settled.cleanupFailure === undefined) return signalledAt(held, settled.exit);
  if (ownsRootCleanup) return cleanupFault(held, settled.exit, settled.cleanupFailure.reason);
  return signalledAt({ result: flowFault(input, settled.cleanupFailure.reason) }, settled.exit);
}

async function closeSignals(input: RunFlowInput, ownsRootCleanup: boolean): Promise<{ settled: Awaited<ReturnType<RunFlowInput["signal"]["drain"]>>; localFailure?: { reason: unknown } }> {
  let localFailure: { reason: unknown } | undefined;
  const closeAdmission = (): void => { localFailure = ownsRootCleanup ? input.machineryStop?.close() : input.localStop?.close(); };
  const settled = ownsRootCleanup ? await input.signal.close(closeAdmission) : await input.signal.release(input.writer, closeAdmission);
  return { settled, ...(localFailure === undefined ? {} : { localFailure }) };
}

async function appendRunEnd(input: RunFlowInput, terminal: TerminalWork): Promise<FlowResult> {
  const { result, output, outputBytes } = terminal;
  const event = runEndEvent({
    ts: input.clock.timestamp(), ...(result.terminalStage === undefined ? {} : result.terminalStage),
    exit: result.exit, cause: result.cause, ...(result.reason === undefined ? {} : { reason: result.reason }),
  });
  const ending = await writerOutcome(input.writer, input.writer.append(event));
  return ending.status === "failed" ? writerFault(input, ending.reason) : { ...flowResult(result, output, outputBytes), ending: event };
}

async function completeRun(input: RunFlowInput, ownsRootCleanup: boolean, teardownShared: () => Promise<void>, unregister: () => void): Promise<FlowResult> {
  const execution: Execution = { input, depth: input.depth ?? 1, callChainDepth: input.callChainDepth ?? 0, containers: [], sequence: runSequence, gatingNode: runGatingNode };
  const sequence = sequenceResult(input, execution);
  let terminal = await readOutput(input, await compromiseRace(input, sequence));
  if (ownsRootCleanup) terminal = await settleRoot(input, terminal);
  const teardown = await writerOutcome(input.writer, teardownShared());
  if (teardown.status === "failed") {
    await closeSignals(input, ownsRootCleanup);
    unregister();
    return writerFault(input, teardown.reason);
  }
  const closed = await closeSignals(input, ownsRootCleanup);
  unregister();
  if (closed.settled.recordFailure !== undefined) return writerFault(input, closed.settled.recordFailure.reason);
  if (closed.localFailure !== undefined) terminal = { result: flowFault(input, closed.localFailure.reason) };
  terminal = applySignalSettlement(input, terminal, ownsRootCleanup, closed.settled);
  return appendRunEnd(input, terminal);
}

function ignoreFailure(operation: Promise<unknown>): Promise<void> { return operation.then(() => undefined, () => undefined); }

function recoverRun(input: RunFlowInput, ownsRootCleanup: boolean, teardownShared: () => Promise<void>, reason: unknown): Promise<never> {
  const cleanup = ownsRootCleanup ? Promise.resolve().then(() => ignoreFailure(input.signal.cleanup())) : Promise.resolve();
  return cleanup.then(() => ignoreFailure(teardownShared()))
    .then(() => ignoreFailure(closeSignals(input, ownsRootCleanup)))
    .then((): never => { throw rejected(reason); });
}

function executeRun(input: RunFlowInput, ownsRootCleanup = false): Promise<FlowResult> {
  let toreDown = false;
  let unregistered = false;
  let unregister = (): void => undefined;
  const unregisterOnce = (): void => {
    if (unregistered) return;
    unregistered = true;
    unregister();
  };
  const teardownShared = async (): Promise<void> => {
    if (input.flow.tmp !== "flow" || toreDown) return;
    toreDown = true;
    await teardownTemporary(input.writer, () => input.clock.timestamp(), undefined, join(input.scratchDirectory, "shared"));
  };
  const work = Promise.resolve().then(() => {
    unregister = input.signal.register(input.writer);
    // The containers' recursion is bound here, once: they run sequences and choosers without importing either (execution.ts says why).
    return completeRun(input, ownsRootCleanup, teardownShared, unregisterOnce);
  });
  return work.then(undefined, (reason: unknown) => recoverRun(input, ownsRootCleanup, teardownShared, reason)).finally(unregisterOnce);
}
export function runFlow(input: RunFlowInput): Promise<FlowResult> { return executeRun(input, true); }
