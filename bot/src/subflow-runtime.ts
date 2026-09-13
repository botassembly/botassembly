import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import type { PausableClock } from "./clock.ts";
import type { FlowResult, LocalStop } from "./execution.ts";
import { attemptKey, scratchAttempt } from "./invocation.ts";
import { faultReason, type Flow, type StageNode } from "./model.ts";
import { subflowEvent } from "./pi-tap.ts";
import { runStartEvent, type RuntimeProvenance, type StageIdentity } from "./record-events.ts";
import { claimRunDirectory, hashBytes, type RecordWriter } from "./record.ts";
import { lockActiveRun } from "./run-lock.ts";
import type { RunSignal } from "./signal.ts";
import { expandSlotPath, type SubflowRequest, type SubflowToolDetail } from "./tools.ts";

export interface ChildRunInput {
  flow: Flow;
  writer: RecordWriter;
  request: { extension: string; diskPath: string; path: string; sha256: string };
  scratchDirectory: string;
  depth: number;
  callChainDepth: number;
  compromised: Promise<never>;
  localStop: LocalStop;
  readFinalOutput: boolean;
}

interface NormalizedInput {
  bytes: Buffer;
  extension: string;
  event?: { path: string; sha256: string; bytes: number };
}

export interface PreparedSubflowInput {
  bytes: Buffer;
  extension: string;
  retained: boolean;
  exposeAnswer?: false;
  event?: { path: string; sha256: string; bytes: number };
}

export interface SubflowBatchInput {
  calls: readonly SubflowRequest[];
  scope: ReadonlyMap<string, Flow>;
  currentFlow: Flow;
  currentDepth: number;
  currentCallChainDepth: number;
  identity: StageIdentity;
  writer: RecordWriter;
  answersDirectory: string;
  scratchDirectory: string;
  metadata: { assembly: string; assemblyHash: string; installationId: string; provenance?: RuntimeProvenance };
  slots: Readonly<Record<string, string>>;
  workdirRoot: string;
  clock: PausableClock;
  monotonic: () => number;
  signal: RunSignal;
  toolSignal: AbortSignal;
  callerStop?: Pick<LocalStop, "failure">;
  counter: { value: number };
  runChild: (input: ChildRunInput) => Promise<FlowResult>;
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : "The subflow input could not be read.";
}

function extension(path: string): string {
  const held = extname(path).slice(1);
  if (held.length === 0) return "txt";
  if (!/^[A-Za-z0-9]+$/u.test(held) || held.length > 247) {
    throw new Error("The subflow input-file extension must use at most 247 ASCII letters or digits.");
  }
  return held;
}

function normalize(request: SubflowRequest, input: SubflowBatchInput): Promise<NormalizedInput> {
  if ("input" in request) {
    const bytes = Buffer.from(request.input);
    return Promise.resolve({ bytes, extension: "txt" });
  }
  const path = expandSlotPath(request["input-file"], input.slots);
  return readFile(path).then((bytes) => ({ bytes, extension: extension(path) }));
}

function retainedInput(input: SubflowBatchInput, call: number, normalized: NormalizedInput): NormalizedInput {
  if (normalized.event !== undefined) return normalized;
  const path = `stages/${input.identity.stage}/${String(input.identity.repeat ?? 1)}/${String(input.identity.retry)}`
    + `/subflows/${String(call)}/request.${normalized.extension}`;
  return { ...normalized, event: { path, sha256: hashBytes(normalized.bytes), bytes: normalized.bytes.length } };
}

function outputLines(text: string): number {
  if (text.length === 0) return 0;
  const count = text.split("\n").length;
  return text.endsWith("\n") ? count - 1 : count;
}

const CONTEXT_BYTES = 10_000;
const TRUNCATION_MARKER = "[output truncated; read the rest from the output path]\n";

function contextContent(text: string): string {
  const bytes = Buffer.from(text);
  if (bytes.length <= CONTEXT_BYTES) return text;
  const limit = CONTEXT_BYTES - Buffer.byteLength(TRUNCATION_MARKER);
  let prefix = bytes.subarray(0, limit).toString("utf8");
  while (Buffer.byteLength(prefix) > limit) prefix = prefix.slice(0, -1);
  return `${TRUNCATION_MARKER}${prefix}`;
}

function depth(input: SubflowBatchInput, flow: Flow | undefined): number {
  return flow !== undefined && flow.path === input.currentFlow.path ? input.currentDepth + 1 : 1;
}

function callDepth(input: SubflowBatchInput, flow: Flow | undefined): number {
  return Math.max(depth(input, flow), input.currentCallChainDepth + 1);
}

function stopped(input: SubflowBatchInput): boolean {
  return input.signal.abort.aborted || input.toolSignal.aborted;
}

function stoppedReason(input: SubflowBatchInput): string {
  if (input.signal.abort.aborted) return "The run was signalled.";
  const inherited = input.callerStop?.failure();
  return inherited === undefined ? "The subflow call was stopped." : `The calling subflow stopped: ${faultReason(inherited.reason)}`;
}

function childStop(root: AbortSignal, caller: AbortSignal, inherited?: Pick<LocalStop, "failure">): LocalStop {
  const controller = new AbortController();
  let held: { reason: unknown } | undefined;
  let closed = false;
  let final: { reason: unknown } | undefined;
  const current = (): { reason: unknown } | undefined => held ?? (caller.aborted ? inherited?.failure() ?? { reason: "The calling subflow stopped." } : undefined);
  return {
    abort: AbortSignal.any([root, caller, controller.signal]),
    fail(reason) {
      if (closed) return;
      held ??= { reason };
      controller.abort();
    },
    failure: () => closed ? final : current(),
    close() {
      final = current();
      closed = true;
      return final;
    },
  };
}

function startEvent(input: SubflowBatchInput, flow: Flow, call: number, normalized: NormalizedInput) {
  return runStartEvent({
    ts: input.clock.timestamp(), run: String(call), assembly: input.metadata.assembly,
    assemblyHash: input.metadata.assemblyHash, installationId: input.metadata.installationId, flow: flow.name,
    ...(input.metadata.provenance === undefined ? {} : { provenance: input.metadata.provenance }),
    request: {
      path: `request.${normalized.extension}`, sha256: hashBytes(normalized.bytes),
      bytes: normalized.bytes.length, via: "subflow",
    },
    workdir: input.workdirRoot,
  });
}

function recordsDirectory(input: SubflowBatchInput): string {
  return join(
    input.writer.runDirectory, "stages", ...input.identity.stage.split("/"),
    String(input.identity.repeat ?? 1), String(input.identity.retry), "subflows",
  );
}

// One more opaque directory under the calling run's scratch root (0067): it
// leaves with the run when `bot prune` takes it, and does not tell the child
// it is call 2 of a stage in a loop.
function childScratch(input: SubflowBatchInput, call: number): string {
  return scratchAttempt(input.scratchDirectory, `${attemptKey(input.identity.stage, input.identity.repeat)}:${String(call)}`);
}

/** The child's answer under `$SUBFLOWS/<call>`, and what the parent reads of it. */
async function carry(
  settled: SubflowToolDetail, answerDirectory: string, call: number, output: NonNullable<FlowResult["output"]>,
): Promise<SubflowToolDetail> {
  const outputPath = join(answerDirectory, `output.${output.extension}`);
  await copyFile(output.diskPath, outputPath);
  const bytes = await readFile(outputPath);
  const text = bytes.toString("utf8");
  return {
    ...settled, output: `$SUBFLOWS/${String(call)}/output.${output.extension}`,
    bytes: bytes.length, lines: outputLines(text), content: contextContent(text),
  };
}

async function childOutcome(
  common: Pick<SubflowToolDetail, "call" | "flow" | "depth" | "input">,
  child: string,
  result: FlowResult,
  answerDirectory: string,
  call: number, exposeAnswer: boolean,
): Promise<SubflowToolDetail> {
  if (result.recordComplete === false) {
    return { ...common, started: true, child, reason: result.reason ?? "Child record machinery failed." };
  }
  const settled = {
    ...common, started: true, exit: result.exit, cause: result.cause, child,
    ...(result.reason === undefined ? {} : { reason: result.reason }),
  };
  if (result.exit !== 0 || result.output === undefined || !exposeAnswer) return settled;
  // The child record is sealed before its output crosses into $SUBFLOWS. A
  // copy failure belongs to this started call and cannot erase that record.
  return carry(settled, answerDirectory, call, result.output).then(
    (value) => value,
    (reason: unknown) => ({ ...settled, reason: rejected(reason).message }),
  );
}

export async function runSubflowChild(
  input: SubflowBatchInput,
  request: SubflowRequest,
  call: number,
  prepared?: PreparedSubflowInput,
): Promise<SubflowToolDetail> {
  const flow = input.scope.get(request.flow);
  const childDepth = depth(input, flow);
  const childCallChainDepth = input.currentCallChainDepth + 1;
  const recordedDepth = callDepth(input, flow);
  // The input seam: a call whose input cannot be read is an outcome, not an
  // exception. A rejection past this point (writer, runChild) still escapes to
  // runSubflowBatch's throw — which the harness turns into an error tool
  // result, so the parent reads it and carries on ("a child that fails or
  // refuses does not fail the parent", subflow.md). Measured, ticket 0076.
  const normalized = await (prepared === undefined ? normalize(request, input) : Promise.resolve(prepared)).then(
    (value) => ("input-file" in request || prepared?.retained === true) ? retainedInput(input, call, value) : value,
    (reason: unknown) => ({ failed: message(reason) }),
  );
  if ("failed" in normalized) {
    return { call, flow: request.flow, depth: recordedDepth, started: false, reason: normalized.failed };
  }
  const exposeAnswer = prepared?.exposeAnswer !== false;
  const answerDirectory = join(input.answersDirectory, String(call));
  if (exposeAnswer) {
    await mkdir(answerDirectory, { recursive: true });
    await writeFile(join(answerDirectory, `input.${normalized.extension}`), normalized.bytes);
  }
  const common = {
    call, flow: request.flow, depth: recordedDepth,
    ...(normalized.event === undefined ? {} : { input: normalized.event }),
  };
  if (flow === undefined || stopped(input)) {
    const reason = flow === undefined ? `Subflow ${request.flow} is not in scope.` : stoppedReason(input);
    return { ...common, started: false, reason };
  }

  const first = startEvent(input, flow, call, normalized);
  const recordDirectory = recordsDirectory(input);
  await mkdir(recordDirectory, { recursive: true });
  const created = await claimRunDirectory(recordDirectory, first.run);
  if (created.status === "taken") return { ...common, started: false, reason: "The child run directory already exists." };
  const lock = lockActiveRun(created.writer.runDirectory, input.monotonic);
  let locked = true;
  const release = (): void => {
    if (!locked) return;
    locked = false;
    lock.release();
  };
  const localStop = childStop(input.signal.abort, input.toolSignal, input.callerStop);
  const compromised = lock.compromised.then(undefined, (reason: unknown): Promise<never> => {
    const failure = reason instanceof Error ? reason : new Error("The child run lock was compromised with a non-Error value.", { cause: reason });
    localStop.fail(failure);
    return Promise.reject(failure);
  });
  void compromised.catch(() => undefined);
  const requestPath = join(created.writer.runDirectory, `request.${normalized.extension}`);
  const child = relative(input.writer.runDirectory, created.writer.runDirectory);
  let started = false;
  const result = await created.writer.start(first).then(async () => {
    started = true;
    await writeFile(requestPath, normalized.bytes);
    return input.runChild({
      flow,
      writer: created.writer,
      request: {
        extension: normalized.extension, diskPath: requestPath,
        path: `request.${normalized.extension}`, sha256: hashBytes(normalized.bytes),
      },
      scratchDirectory: childScratch(input, call),
      depth: childDepth, callChainDepth: childCallChainDepth, compromised, localStop,
      readFinalOutput: exposeAnswer,
    });
  }).then((held) => held, (reason: unknown): Promise<never> => {
    const failed = rejected(reason);
    if (started) childFailures.set(failed, { child, input: normalized.event });
    return Promise.reject(failed);
  }).finally(release);
  return childOutcome(common, child, result, answerDirectory, call, exposeAnswer);
}

function rejected(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("A subflow child rejected.", { cause: reason });
}

const childFailures = new WeakMap<Error, { child: string; input?: NormalizedInput["event"] }>();

// A rejection after `run_start` names the child without inventing its ending.
export function declinedSubflowChild(
  input: SubflowBatchInput, request: SubflowRequest, call: number, reason: unknown,
): SubflowToolDetail {
  const failure = reason instanceof Error ? childFailures.get(reason) : undefined;
  const common = { call, flow: request.flow, depth: callDepth(input, input.scope.get(request.flow)), reason: rejected(reason).message };
  return failure === undefined ? { ...common, started: false }
    : { ...common, ...(failure.input === undefined ? {} : { input: failure.input }), started: true, child: failure.child };
}

export async function runSubflowBatch(input: SubflowBatchInput): Promise<SubflowToolDetail[]> {
  const numbered = input.calls.map((request) => ({ request, call: ++input.counter.value }));
  input.clock.pause();
  const settlements = await Promise.allSettled(numbered.map(({ request, call }) => runSubflowChild(input, request, call)));
  input.clock.resume();
  const evidence: { request: SubflowRequest; detail: SubflowToolDetail }[] = [];
  const details: SubflowToolDetail[] = [];
  let failure: { reason: unknown } | undefined;
  for (const [index, settlement] of settlements.entries()) {
    const held = numbered[index];
    if (held === undefined) continue;
    if (settlement.status === "fulfilled") details.push(settlement.value);
    else failure ??= { reason: settlement.reason as unknown };
    evidence.push({
      request: held.request,
      detail: settlement.status === "fulfilled" ? settlement.value : declinedSubflowChild(input, held.request, held.call, settlement.reason),
    });
  }
  if (failure === undefined) return details;
  // The rejection still escapes — the batch's evidence goes down first, in call
  // order, one event per call however it went. A rejecting tool never reaches
  // the tap that records the calls (pi-tap.ts, "an errored end never
  // executed"), so this is the only place the batch's own record gets written:
  // a sibling that ran and produced output, and a call the machinery failed,
  // are each one event in the parent's record (subflow.md). `allSettled` waited
  // for every one of them; this is what waiting was for.
  const context = { writer: input.writer, identity: input.identity, now: () => input.clock.timestamp() };
  for (const [index, held] of evidence.entries()) await input.writer.append(subflowEvent(context, input.identity, held.request, held.detail, index));
  throw rejected(failure.reason);
}

export function scopedSubflows(
  assembly: ReadonlyMap<string, Flow>, flow: Flow, stage: StageNode | undefined, currentDepth: number, callChainDepth = 0,
): Map<string, Flow> {
  if (callChainDepth >= 10) return new Map();
  const scope = new Map(assembly);
  // A stage never has the flow it stands in — an assembly-scoped subflow would
  // otherwise see itself and recurse unbounded. DESCEND is the one grant back.
  if (scope.get(flow.name) === flow) scope.delete(flow.name);
  for (const [name, child] of flow.subflows) scope.set(name, child);
  if (flow.maxDepth !== undefined && currentDepth < flow.maxDepth) scope.set(flow.name, flow);
  for (const [name, child] of stage?.subflows ?? []) scope.set(name, child);
  return scope;
}
