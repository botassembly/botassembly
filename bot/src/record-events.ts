import pkg from "../package.json" with { type: "json" };
import { fanoutDoneEvent, fanoutStartEvent } from "./fanout-events.ts";
import type { StageAccess } from "./model.ts";
import { stageFields, type HashedPath, type StageIdentity } from "./record-fields.ts";
import type { Cause } from "./spine.ts";

export { fanoutDoneEvent, fanoutStartEvent, type FanoutIdentity, type FanoutPlan } from "./fanout-events.ts";
export type { HashedPath, StageIdentity } from "./record-fields.ts";
export interface RecordedTool { name: string; description: string }

export function hashDriftEvent(input: {
  ts: string;
  file: string;
  expected: string;
  actual: string;
}) {
  return { ts: input.ts, event: "hash_drift" as const, file: input.file, expected: input.expected, actual: input.actual };
}

export function signalEvent(input: { ts: string; signal: number; name: string }) {
  return { ts: input.ts, event: "signal" as const, signal: input.signal, name: input.name };
}

export type OptionLadder = { name: string; value: string | number; rung: string }[];
export interface StageSlots {
  pwd: string;
  input: string;
  output: string;
  tmp: string;
  skills: string;
  subflows?: string;
}
export interface RuntimeProvenance {
  runtimeSource: "checkout" | "unknown";
  runtimeDigest: string | null;
  lockSha256: string;
  node: string;
  providerAdapter: string;
  runtimeTreeSha256: string;
  modelSource?: "scripted";
}

export const RUNTIME_VERSION = pkg.version;

interface RunStartInputBase {
  ts: string;
  run: string;
  assembly: string;
  assemblyHash: string;
  flow?: string;
  continuedFrom?: string;
  correlation?: string;
  request: HashedPath & { bytes: number; via: string };
  /** The caller-selected root, absolute so liveness readers share its base. */
  workdir?: string;
}

export type RunStartInput = RunStartInputBase & ({ installationId: string; provenance: RuntimeProvenance } | { installationId?: undefined; provenance?: undefined });

export function runStartEvent(input: RunStartInput) {
  return {
    record: 1 as const,
    // Which bot wrote it, beside which format it wrote (record.md): the
    // manifest bound at module load, never read off disk at run time.
    runtime: RUNTIME_VERSION,
    ts: input.ts,
    event: "run_start" as const,
    run: input.run,
    assembly: input.assembly,
    assembly_hash: input.assemblyHash,
    ...(input.flow === undefined ? {} : { flow: input.flow }),
    ...(input.continuedFrom === undefined ? {} : { continued_from: input.continuedFrom }),
    ...(input.correlation === undefined ? {} : { correlation: input.correlation }),
    ...(input.installationId === undefined ? {} : { installation_id: input.installationId }),
    request: input.request,
    ...(input.workdir === undefined ? {} : { workdir: input.workdir }),
    ...(input.provenance === undefined
      ? {}
      : {
          runtime_source: input.provenance.runtimeSource,
          runtime_digest: input.provenance.runtimeDigest,
          lock_sha256: input.provenance.lockSha256,
          node: input.provenance.node,
          provider_adapter: input.provenance.providerAdapter,
          runtime_tree_sha256: input.provenance.runtimeTreeSha256,
          ...(input.provenance.modelSource === undefined ? {} : { model_source: input.provenance.modelSource }),
        }),
  };
}

export type RunStartEvent = ReturnType<typeof runStartEvent>;

// A handled fault or signal can say where execution stopped: "the record it
// had already started says where" (runtime.md#exit-codes). The reason rides the
// run's ending as it rides a stage's, and is absent when there is none.
type RunEndStage = StageIdentity | { stage?: never; repeat?: never; retry?: never };
export function runEndEvent(input: { ts: string; exit: number; cause: Cause; reason?: string } & RunEndStage) {
  return { ts: input.ts, event: "run_end" as const, ...(input.stage === undefined ? {} : { stage: input.stage, ...(input.repeat === undefined ? {} : { repeat: input.repeat }), retry: input.retry }), exit: input.exit, cause: input.cause, ...(input.reason === undefined ? {} : { reason: input.reason }) };
}
export type RunEndEvent = ReturnType<typeof runEndEvent>;

export function stageCarriedEvent(input: {
  ts: string;
  identity: StageIdentity;
  from: string;
  output?: HashedPath;
}) {
  return {
    ...stageFields(input.ts, "stage_carried" as const, input.identity),
    from: input.from,
    ...(input.output === undefined ? {} : { output: input.output }),
  };
}

export type SkillSource = "workspace" | "assembly-root" | "flow-local" | "container-local" | "stage-local";
export interface RecruitedSkill { name: string; source: SkillSource }

export type PromptSource =
  | { source: "assembly" | "flow" | "stage" | "schema" | "request"; path: string }
  | { source: "workspace"; mode: "announce" | "use"; name?: string; path: string }
  | { source: "skill" | "helper" | "input"; name: string; path: string }
  | { source: "harness"; system: string; firstTurn: string };

export function stageStartEvent(input: {
  ts: string;
  identity: StageIdentity;
  received: (HashedPath & { name: string })[];
  options: OptionLadder;
  slots?: StageSlots;
  workdir?: { authored: string | null; resolved: string };
  session?: string;
  tools?: RecordedTool[];
  skills?: RecruitedSkill[]; access?: StageAccess;
}) {
  return {
    ...stageFields(input.ts, "stage_start" as const, input.identity),
    received: input.received,
    options: input.options,
    ...(input.slots === undefined ? {} : { slots: input.slots }),
    ...(input.workdir === undefined ? {} : { workdir: input.workdir }),
    ...(input.session === undefined ? {} : { session: input.session }),
    ...(input.tools === undefined ? {} : { tools: input.tools }),
    ...(input.skills === undefined ? {} : { skills: input.skills }), ...(input.access === undefined ? {} : { access: input.access }),
  };
}

export function toolDeniedEvent(input: { ts: string; identity: StageIdentity; tool: string; boundary: string }) {
  return { ...stageFields(input.ts, "tool_denied" as const, input.identity), tool: input.tool, boundary: input.boundary };
}

export function promptEvent(input: {
  ts: string;
  identity: StageIdentity;
  prompt: PromptSource[];
}) {
  return {
    ...stageFields(input.ts, "prompt" as const, input.identity),
    prompt: input.prompt,
  };
}

type StageEndOutput =
  | { output: HashedPath; sealed: boolean; judged: boolean }
  | { output?: never; sealed?: never; judged?: never };

export function stageEndEvent(input: {
  ts: string;
  identity: StageIdentity;
  exit: number;
  cause: Cause;
  reason?: string;
} & StageEndOutput) {
  return {
    ...stageFields(input.ts, "stage_end" as const, input.identity),
    exit: input.exit,
    cause: input.cause,
    ...(input.output === undefined
      ? {}
      : { output: input.output, sealed: input.sealed, judged: input.judged }),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
}

// Work the runtime abandoned and never saw settle (ticket 0028): the window
// is when the prompt started and when the runtime stopped listening. Its
// spend is unknowable by construction, so nothing here enters any total.
export function unreconciledEvent(input: {
  ts: string;
  identity: StageIdentity;
  started: string;
  stopped: string;
}) {
  return {
    ...stageFields(input.ts, "unreconciled" as const, input.identity),
    started: input.started,
    stopped: input.stopped,
  };
}

// A temporary-directory teardown that failed after its stage settled (ticket
// 0141): diagnostic only, so the settled ending stands. It follows the
// stage's closing stage_end the way run_end carries stage fields — naming the
// stage without being one of its own work events.
export function tmpTeardownEvent(input: {
  ts: string;
  identity?: StageIdentity;
  reason: string;
}) {
  return {
    ts: input.ts,
    event: "tmp_teardown" as const,
    ...(input.identity === undefined ? {} : {
      stage: input.identity.stage,
      ...(input.identity.repeat === undefined ? {} : { repeat: input.identity.repeat }),
      retry: input.identity.retry,
    }),
    reason: input.reason,
  };
}

export function turnEvent(input: {
  ts: string;
  identity: StageIdentity;
  provider: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  stop: string;
}) {
  return {
    ...stageFields(input.ts, "turn" as const, input.identity),
    provider: input.provider,
    model: input.model,
    input: input.input,
    output: input.output,
    cache_read: input.cacheRead,
    cache_write: input.cacheWrite,
    total: input.total,
    stop: input.stop,
  };
}

export function providerStartEvent(input: { ts: string; identity: StageIdentity; provider: string; model: string }) {
  return { ...stageFields(input.ts, "provider_start" as const, input.identity), provider: input.provider, model: input.model };
}

export function providerRetryEvent(input: { ts: string; identity: StageIdentity; attempt: number; delayMs: number }) {
  return { ...stageFields(input.ts, "provider_retry" as const, input.identity), attempt: input.attempt, delay_ms: input.delayMs };
}
type ProviderTransportOutcome =
  | { source: "requested"; configuredTransport?: never; fallbackTransport?: never; eventsEmitted?: never; phase?: never; error?: never }
  | { source: "diagnostic"; configuredTransport: "websocket" | "sse"; fallbackTransport?: "websocket" | "sse"; eventsEmitted: boolean; phase: string; error: { name?: string; message: string; code?: string | number } };
export function providerTransportEvent(input: { ts: string; identity: StageIdentity; transport: "websocket" | "sse" } & ProviderTransportOutcome) {
  return { ...stageFields(input.ts, "provider_transport" as const, input.identity), transport: input.transport, source: input.source, ...(input.source === "requested" ? {} : { configured_transport: input.configuredTransport, ...(input.fallbackTransport === undefined ? {} : { fallback_transport: input.fallbackTransport }), events_emitted: input.eventsEmitted, phase: input.phase, error: input.error }) };
}
export type CheckKind = "output" | "checklist" | "schema" | "gate" | "select" | "question";

export function gateStartEvent(input: {
  ts: string;
  identity: StageIdentity;
  file: string;
  sha256: string;
}) {
  return {
    ...stageFields(input.ts, "gate_start" as const, input.identity),
    file: input.file,
    sha256: input.sha256,
  };
}

type CheckExecution = { file: string; sha256: string } | { file?: never; sha256?: never };
export function checkEvent(input: {
  ts: string;
  identity: StageIdentity;
  check: CheckKind;
  exit: number | null;
  capture: string;
} & CheckExecution) {
  return {
    ...stageFields(input.ts, "check" as const, input.identity),
    check: input.check,
    ...(input.file === undefined ? {} : { file: input.file }),
    exit: input.exit,
    capture: input.capture,
    ...(input.sha256 === undefined ? {} : { sha256: input.sha256 }),
  };
}

export const CONTROL_TOOLS = ["mark", "refuse", "continue", "select", "clean-temp", "fault"] as const;
export type ControlTool = (typeof CONTROL_TOOLS)[number];

export function toolCallEvent(input: {
  ts: string;
  identity: StageIdentity;
  tool: ControlTool;
  decision: string;
  evidence?: string;
  reason?: string;
  item?: number;
}) {
  return {
    ...stageFields(input.ts, "tool_call" as const, input.identity),
    tool: input.tool,
    decision: input.decision,
    ...(input.tool === "mark" && input.evidence !== undefined ? { evidence: input.evidence } : {}),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.item === undefined ? {} : { item: input.item }),
  };
}

export type SubflowInput = ({ text: string } | { path: string }) & { sha256: string; bytes: number };
type SubflowOutcome =
  | { started: true; input: SubflowInput; exit: number; cause: Cause; child: string; reason?: string }
  | { started: true; input: SubflowInput; exit?: never; cause?: never; child: string; reason?: string }
  | { started: false; input?: SubflowInput; exit?: never; cause?: never; child?: never; reason?: string };

type SubflowOrigin =
  | { via?: never; item?: never; output?: never }
  | { via: "fanout"; item: string; output?: HashedPath };

export function subflowCallEvent(input: {
  ts: string;
  identity: StageIdentity;
  call: number;
  flow: string;
  depth: number;
} & SubflowOutcome & SubflowOrigin) {
  return {
    ...stageFields(input.ts, "subflow_call" as const, input.identity),
    call: input.call,
    flow: input.flow,
    ...(input.input === undefined ? {} : { input: input.input }),
    ...(input.exit === undefined ? {} : { exit: input.exit }),
    ...(input.cause === undefined ? {} : { cause: input.cause }),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.child === undefined ? {} : { child: input.child }),
    ...(input.via === undefined ? {} : { via: input.via, item: input.item, ...(input.output === undefined ? {} : { output: input.output }) }),
    depth: input.depth,
    started: input.started,
  };
}

export function choseEvent(input: {
  ts: string;
  identity: StageIdentity;
  chose?: string;
  declined: string[];
  reason: string;
}) {
  return {
    ...stageFields(input.ts, "chose" as const, input.identity),
    ...(input.chose === undefined ? {} : { chose: input.chose }),
    declined: input.declined,
    reason: input.reason,
  };
}

export function loopDoneEvent(input: {
  ts: string;
  identity: StageIdentity;
  repeats: number;
  endedBy: "stop" | "limit" | Exclude<Cause, "success" | "signal">;
  reason?: string;
}) {
  return {
    ...stageFields(input.ts, "loop_done" as const, input.identity),
    repeats: input.repeats,
    ended_by: input.endedBy,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
}

export type ParallelBranch =
  | { branch: string; started: true; exit: number; cause: Cause }
  | { branch: string; started: false; exit?: never; cause?: never };

export function parallelDoneEvent(input: {
  ts: string;
  identity: StageIdentity;
  width: number;
  concurrent: number;
  branches: ParallelBranch[];
}) {
  return {
    ...stageFields(input.ts, "parallel_done" as const, input.identity),
    width: input.width,
    concurrent: input.concurrent,
    branches: input.branches,
  };
}

export function hookEvent(input: {
  ts: string;
  identity: StageIdentity;
  hook: "before" | "success" | "failure";
  exit: number | null;
  capture: string;
  sha256: string;
}) {
  return {
    ...stageFields(input.ts, "hook" as const, input.identity),
    hook: input.hook,
    exit: input.exit,
    capture: input.capture,
    sha256: input.sha256,
  };
}

export const RECORD_EVENT_CONSTRUCTORS = {
  run_start: runStartEvent,
  run_end: runEndEvent,
  stage_carried: stageCarriedEvent,
  stage_start: stageStartEvent,
  prompt: promptEvent,
  stage_end: stageEndEvent,
  unreconciled: unreconciledEvent,
  tmp_teardown: tmpTeardownEvent,
  provider_start: providerStartEvent,
  turn: turnEvent,
  provider_retry: providerRetryEvent,
  provider_transport: providerTransportEvent,
  gate_start: gateStartEvent,
  check: checkEvent,
  tool_call: toolCallEvent,
  tool_denied: toolDeniedEvent,
  subflow_call: subflowCallEvent,
  chose: choseEvent,
  loop_done: loopDoneEvent,
  parallel_done: parallelDoneEvent,
  fanout_start: fanoutStartEvent,
  fanout_done: fanoutDoneEvent,
  hook: hookEvent,
  hash_drift: hashDriftEvent,
  signal: signalEvent,
} as const;

export type RecordEventName = keyof typeof RECORD_EVENT_CONSTRUCTORS;
export type RecordEvent = ReturnType<(typeof RECORD_EVENT_CONSTRUCTORS)[RecordEventName]>;

export function isRecordEventName(value: unknown): value is RecordEventName { return typeof value === "string" && Object.hasOwn(RECORD_EVENT_CONSTRUCTORS, value); }
