import { expect, test } from "vitest";
import { recordEventShape } from "./support/record-event-shape.ts";
import {
  RECORD_EVENT_CONSTRUCTORS,
  checkEvent,
  choseEvent,
  fanoutDoneEvent,
  fanoutStartEvent,
  gateStartEvent,
  hashDriftEvent,
  hookEvent,
  loopDoneEvent,
  parallelDoneEvent,
  promptEvent, providerStartEvent,
  providerRetryEvent,
  providerTransportEvent,
  runEndEvent,
  runStartEvent,
  signalEvent,
  stageCarriedEvent,
  stageEndEvent,
  stageStartEvent,
  subflowCallEvent,
  tmpTeardownEvent,
  toolCallEvent,
  toolDeniedEvent,
  turnEvent,
  unreconciledEvent,
  type RecordEvent,
  type RecordEventName,
} from "../src/record-events.ts";

const TS = "2026-09-04T10:00:01.000Z";
const RUN = "2026-09-04T10-00-00-a001";
const HASH = "a".repeat(64);
const IDENTITY = { stage: "01-work", retry: 1 };
const OUTPUT = { path: "stages/01-work/1/1/output.txt", sha256: HASH };

type KeysOfUnion<T> = T extends unknown ? keyof T : never;
type EventFields<Name extends RecordEventName> = Exclude<KeysOfUnion<Extract<RecordEvent, { event: Name }>>, "event">;
type FieldCoverage = { [Name in RecordEventName]: { [Field in EventFields<Name>]: true } };

const FIELD_COVERAGE = {
  run_start: { record: true, runtime: true, ts: true, run: true, assembly: true, assembly_hash: true, flow: true,
    continued_from: true, correlation: true, installation_id: true, request: true, workdir: true, runtime_source: true, runtime_digest: true, lock_sha256: true,
    node: true, provider_adapter: true, runtime_tree_sha256: true, model_source: true },
  run_end: { ts: true, stage: true, repeat: true, retry: true, exit: true, cause: true, reason: true },
  stage_carried: { ts: true, stage: true, repeat: true, retry: true, from: true, output: true },
  stage_start: { ts: true, stage: true, repeat: true, retry: true, received: true, options: true, slots: true,
    workdir: true, session: true, tools: true, skills: true, access: true },
  prompt: { ts: true, stage: true, repeat: true, retry: true, prompt: true },
  stage_end: { ts: true, stage: true, repeat: true, retry: true, exit: true, cause: true, output: true, sealed: true,
    judged: true, reason: true },
  unreconciled: { ts: true, stage: true, repeat: true, retry: true, started: true, stopped: true },
  tmp_teardown: { ts: true, stage: true, repeat: true, retry: true, reason: true },
  provider_start: { ts: true, stage: true, repeat: true, retry: true, provider: true, model: true },
  turn: { ts: true, stage: true, repeat: true, retry: true, provider: true, model: true, input: true, output: true,
    cache_read: true, cache_write: true, total: true, stop: true },
  provider_retry: { ts: true, stage: true, repeat: true, retry: true, attempt: true, delay_ms: true },
  provider_transport: { ts: true, stage: true, repeat: true, retry: true, transport: true, source: true,
    configured_transport: true, fallback_transport: true, events_emitted: true, phase: true, error: true },
  gate_start: { ts: true, stage: true, repeat: true, retry: true, file: true, sha256: true },
  check: { ts: true, stage: true, repeat: true, retry: true, check: true, file: true, exit: true, capture: true, sha256: true },
  tool_call: { ts: true, stage: true, repeat: true, retry: true, tool: true, decision: true, evidence: true, reason: true, item: true },
  tool_denied: { ts: true, stage: true, repeat: true, retry: true, tool: true, boundary: true },
  subflow_call: { ts: true, stage: true, repeat: true, retry: true, call: true, flow: true, input: true, exit: true,
    cause: true, reason: true, child: true, depth: true, started: true, via: true, item: true, output: true },
  chose: { ts: true, stage: true, repeat: true, retry: true, chose: true, declined: true, reason: true },
  loop_done: { ts: true, stage: true, repeat: true, retry: true, repeats: true, ended_by: true, reason: true },
  parallel_done: { ts: true, stage: true, repeat: true, retry: true, width: true, concurrent: true, branches: true },
  fanout_start: { ts: true, stage: true, retry: true, received: true, items: true, subflow: true,
    width: true, max_items: true, manifest_bytes: true, manifest_sha256: true, plan: true },
  fanout_done: { ts: true, stage: true, retry: true, exit: true, cause: true, concurrent: true, selected: true },
  hook: { ts: true, stage: true, repeat: true, retry: true, hook: true, exit: true, capture: true, sha256: true },
  hash_drift: { ts: true, file: true, expected: true, actual: true },
  signal: { ts: true, signal: true, name: true },
} satisfies FieldCoverage;

const REQUIRED_FIELDS: Record<RecordEventName, readonly string[]> = {
  run_start: ["record", "runtime", "ts", "event", "run", "assembly", "assembly_hash", "request",
    "runtime_source", "runtime_digest", "lock_sha256", "node", "provider_adapter", "runtime_tree_sha256"],
  run_end: ["ts", "event", "stage", "retry", "exit", "cause"],
  stage_carried: ["ts", "event", "stage", "retry", "from"],
  stage_start: ["ts", "event", "stage", "retry", "received", "options"],
  prompt: ["ts", "event", "stage", "retry", "prompt"],
  stage_end: ["ts", "event", "stage", "retry", "exit", "cause", "output", "sealed", "judged"],
  unreconciled: ["ts", "event", "stage", "retry", "started", "stopped"],
  tmp_teardown: ["ts", "event", "stage", "retry", "reason"],
  provider_start: ["ts", "event", "stage", "retry", "provider", "model"],
  turn: ["ts", "event", "stage", "retry", "provider", "model", "input", "output", "cache_read", "cache_write", "total", "stop"],
  provider_retry: ["ts", "event", "stage", "retry", "attempt", "delay_ms"],
  provider_transport: ["ts", "event", "stage", "retry", "transport", "source", "configured_transport", "events_emitted", "phase", "error"],
  gate_start: ["ts", "event", "stage", "retry", "file", "sha256"],
  check: ["ts", "event", "stage", "retry", "check", "file", "exit", "capture", "sha256"],
  tool_call: ["ts", "event", "stage", "retry", "tool", "decision", "evidence", "reason", "item"],
  tool_denied: ["ts", "event", "stage", "retry", "tool", "boundary"],
  subflow_call: ["ts", "event", "stage", "retry", "call", "flow", "input", "exit", "cause", "child", "depth", "started"],
  chose: ["ts", "event", "stage", "retry", "chose", "declined", "reason"],
  loop_done: ["ts", "event", "stage", "retry", "repeats", "ended_by"],
  parallel_done: ["ts", "event", "stage", "retry", "width", "concurrent", "branches"],
  fanout_start: ["ts", "event", "stage", "retry", "received", "items", "subflow", "width", "max_items", "manifest_bytes", "manifest_sha256", "plan"],
  fanout_done: ["ts", "event", "stage", "retry", "exit", "cause", "concurrent"],
  hook: ["ts", "event", "stage", "retry", "hook", "exit", "capture", "sha256"],
  hash_drift: ["ts", "event", "file", "expected", "actual"],
  signal: ["ts", "event", "signal", "name"],
};

function start() {
  return runStartEvent({ ts: TS, run: RUN, assembly: "review", assemblyHash: HASH, flow: "main",
    request: { path: "request.txt", sha256: HASH, bytes: 4, via: "argument" } });
}

function opened() {
  return stageStartEvent({ ts: TS, identity: IDENTITY, received: [], options: [] });
}

function fieldSamples(): Record<RecordEventName, Record<string, unknown>> {
  const identity = { ...IDENTITY, repeat: 1 };
  return {
    run_start: runStartEvent({ ts: TS, run: RUN, assembly: "review", assemblyHash: HASH, flow: "main",
      continuedFrom: "previous", correlation: "caller-42", installationId: "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8", request: { path: "request.txt", sha256: HASH, bytes: 4, via: "argument" },
      workdir: "/workspace", provenance: { runtimeSource: "checkout", runtimeDigest: "abc", lockSha256: HASH,
        node: "v24", providerAdapter: "pi", runtimeTreeSha256: HASH, modelSource: "scripted" } }),
    run_end: runEndEvent({ ts: TS, ...identity, exit: 2, cause: "fault", reason: "failed" }),
    stage_carried: stageCarriedEvent({ ts: TS, identity, from: RUN, output: OUTPUT }),
    stage_start: stageStartEvent({ ts: TS, identity, received: [{ name: "request", path: "request.txt", sha256: HASH }],
      options: [{ name: "timeout", value: 10, rung: "stage" }],
      slots: { pwd: "/workspace", input: "/input", output: "/output", tmp: "/workspace/tmp", skills: "/skills",
        subflows: "/subflows" },
      workdir: { authored: null, resolved: "." }, session: "stages/01-work/1/session.jsonl",
      tools: [{ name: "read", description: "Read" }], skills: [{ name: "review", source: "stage-local" }],
      access: { read: ["INPUT"] } }),
    prompt: promptEvent({ ts: TS, identity, prompt: [{ source: "workspace", mode: "use", name: "review", path: "skills/review/SKILL.md" }] }),
    stage_end: stageEndEvent({ ts: TS, identity, exit: 0, cause: "success", output: OUTPUT, sealed: true, judged: true, reason: "done" }),
    unreconciled: unreconciledEvent({ ts: TS, identity, started: TS, stopped: TS }),
    tmp_teardown: tmpTeardownEvent({ ts: TS, identity, reason: "failed" }),
    provider_start: providerStartEvent({ ts: TS, identity, provider: "faux", model: "faux-1" }),
    turn: turnEvent({ ts: TS, identity, provider: "faux", model: "faux-1", input: 1, output: 1,
      cacheRead: 0, cacheWrite: 0, total: 2, stop: "stop" }),
    provider_retry: providerRetryEvent({ ts: TS, identity, attempt: 2, delayMs: 10 }),
    provider_transport: providerTransportEvent({ ts: TS, identity, transport: "sse", source: "diagnostic",
      configuredTransport: "websocket", fallbackTransport: "sse", eventsEmitted: false, phase: "open",
      error: { name: "Error", message: "failed", code: "ECONNRESET" } }),
    gate_start: gateStartEvent({ ts: TS, identity, file: "gate/test.sh", sha256: HASH }),
    check: checkEvent({ ts: TS, identity, check: "gate", exit: 0, capture: "checks/gate.txt", file: "gate/test.sh", sha256: HASH }),
    tool_call: toolCallEvent({ ts: TS, identity, tool: "mark", decision: "skipped", item: 1, evidence: "checked", reason: "not applicable" }),
    tool_denied: toolDeniedEvent({ ts: TS, identity, tool: "read", boundary: "INPUT" }),
    subflow_call: subflowCallEvent({ ts: TS, identity: IDENTITY, call: 1, flow: "child", depth: 1, started: true,
      input: { path: "stages/01-work/1/1/subflows/1/request.json", sha256: HASH, bytes: 4 },
      child: "stages/01-work/1/1/subflows/1", exit: 0, cause: "success", reason: "done",
      via: "fanout", item: "a", output: { path: "stages/01-work/1/1/subflows/1/stages/01-answer/1/1/output.txt", sha256: HASH } }),
    chose: choseEvent({ ts: TS, identity, chose: "safe", declined: ["fast"], reason: "safer" }),
    loop_done: loopDoneEvent({ ts: TS, identity, repeats: 1, endedBy: "fault", reason: "failed" }),
    parallel_done: parallelDoneEvent({ ts: TS, identity, width: 2, concurrent: 1,
      branches: [{ branch: "a", started: true, exit: 0, cause: "success" }, { branch: "b", started: false }] }),
    fanout_start: fanoutStartEvent({ ts: TS, identity: IDENTITY, received: OUTPUT, items: "jobs", subflow: "child", width: 2,
      maxItems: 2, manifestBytes: 10, manifestSha256: HASH,
      plan: [{ item: "a", call: 1, request_bytes: 10, request_sha256: HASH }] }),
    fanout_done: fanoutDoneEvent({ ts: TS, identity: IDENTITY, exit: 1, cause: "rejected", concurrent: 2, selected: "a" }),
    hook: hookEvent({ ts: TS, identity, hook: "before", exit: 0, capture: "hooks/before.txt", sha256: HASH }),
    hash_drift: hashDriftEvent({ ts: TS, file: "gate/test.sh", expected: HASH, actual: "b".repeat(64) }),
    signal: signalEvent({ ts: TS, signal: 15, name: "SIGTERM" }),
  };
}

function wrongType(value: unknown): unknown {
  if (typeof value === "string") return { wrong: true };
  if (typeof value === "number") return "wrong";
  if (typeof value === "boolean") return "wrong";
  if (Array.isArray(value)) return { wrong: true };
  return "wrong";
}

function additionalFieldSamples(): Partial<Record<RecordEventName, Record<string, unknown>[]>> {
  return {
    subflow_call: [subflowCallEvent({ ts: TS, identity: { ...IDENTITY, repeat: 1 }, call: 1, flow: "child",
      depth: 1, started: false, reason: "declined" })],
  };
}

test("the constructor registry and field coverage ledger cover every current event field", () => {
  expect(Object.keys(RECORD_EVENT_CONSTRUCTORS)).toEqual(Object.keys(FIELD_COVERAGE));
  const samples = fieldSamples();
  const additional = additionalFieldSamples();
  for (const name of Object.keys(RECORD_EVENT_CONSTRUCTORS) as RecordEventName[]) {
    const sample = samples[name];
    const covered = new Set(Object.keys(FIELD_COVERAGE[name]));
    for (const field of Object.keys(sample)) if (field !== "event") expect(covered.has(field), `${name}.${field}`).toBe(true);
    for (const field of covered) {
      expect([sample, ...(additional[name] ?? [])].some((held) => Object.hasOwn(held, field)), `${name}.${field}`).toBe(true);
    }
  }
});

test("a current writer run_start requires a canonical installation identity", () => {
  const current = runStartEvent({ ts: TS, run: RUN, assembly: "review", assemblyHash: HASH,
    request: { path: "request.txt", sha256: HASH, bytes: 4, via: "argument" },
    provenance: { runtimeSource: "checkout", runtimeDigest: "abc", lockSha256: HASH, node: "v24", providerAdapter: "pi" } } as never);
  expect(recordEventShape(current)).toBe("run_start requires its current writer fields");
});

function fanoutIdentityTypeProof(): unknown {
  // @ts-expect-error FANOUT cannot carry repeat under its root-only placement rule.
  return fanoutStartEvent({ ts: TS, identity: { ...IDENTITY, repeat: 1 }, received: OUTPUT, items: "jobs", subflow: "child",
    width: 1, maxItems: 1, manifestBytes: 2, manifestSha256: HASH, plan: [] });
}
void fanoutIdentityTypeProof;

test("every known top-level field rejects a wrong type and unknown top-level fields stay additive", () => {
  const samples = fieldSamples();
  for (const name of Object.keys(RECORD_EVENT_CONSTRUCTORS) as RecordEventName[]) {
    const sample = samples[name];
    for (const field of Object.keys(FIELD_COVERAGE[name])) {
      expect(recordEventShape({ ...sample, [field]: wrongType(sample[field]) }), `${name}.${field}`).toBeDefined();
    }
    expect(recordEventShape({ ...sample, future_additive_field: { any: "shape" } }), name).toBeUndefined();
  }
  for (const via of [null, 7, "body", { retained: true }, ["future"]]) {
    expect(recordEventShape({ ...samples.chose, via }), "chose.via additive").toBeUndefined();
  }
});

test("each required field is required in its constructor form", () => {
  const samples = fieldSamples();
  for (const name of Object.keys(RECORD_EVENT_CONSTRUCTORS) as RecordEventName[]) {
    for (const field of REQUIRED_FIELDS[name]) {
      const mutation = Object.fromEntries(Object.entries(samples[name]).filter(([key]) => key !== field));
      expect(recordEventShape(mutation), `${name}.${field}`).toBeDefined();
    }
  }
});

test("closed nested shapes and conditional groups reject partial or extra members", () => {
  const samples = fieldSamples();
  const start = samples.run_start;
  const stage = samples.stage_start;
  const promptBase = promptEvent({ ts: TS, identity: IDENTITY, prompt: [] });
  const mutations: Record<string, unknown>[] = [
    { ...start, request: { ...(start["request"] as Record<string, unknown>), extra: true } },
    { ...stage, received: [{ name: "request", path: "request.txt", sha256: HASH, extra: true }] },
    { ...stage, received: [{ name: "request", path: "request.txt", sha256: HASH, bytes: 4 }] },
    { ...stage, received: [{ name: "request", path: "request.txt", sha256: HASH, bytes: 4, via: "argument" }] },
    { ...stage, options: [{ name: "timeout", value: 10, rung: "stage", extra: true }] },
    { ...stage, slots: { ...(stage["slots"] as Record<string, unknown>), extra: true } },
    { ...stage, workdir: { ...(stage["workdir"] as Record<string, unknown>), extra: true } },
    { ...stage, tools: [{ name: "read", description: "Read", extra: true }] },
    { ...stage, skills: [{ name: "review", source: "stage-local", extra: true }] },
    { ...stage, access: { read: ["INPUT"], invented: ["OUTPUT"] } },
    { ...promptBase, prompt: [{ source: "request", path: "request.txt", extra: true }] },
    { ...promptBase, prompt: [{ source: "skill", name: "review", path: "skills/review/SKILL.md", extra: true }] },
    { ...promptBase, prompt: [{ source: "workspace", mode: "use", path: "skills/review/SKILL.md", extra: true }] },
    { ...promptBase, prompt: [{ source: "harness", system: "system.txt", firstTurn: "first.txt", extra: true }] },
    { ...samples.provider_transport, error: { message: "failed", extra: true } },
    { ...samples.stage_end, output: { ...(samples.stage_end["output"] as Record<string, unknown>), extra: true } },
    { ...samples.subflow_call, input: { ...(samples.subflow_call["input"] as Record<string, unknown>), extra: true } },
    { ...samples.parallel_done, branches: [{ branch: "a", started: true, exit: 0, cause: "success", extra: true }] },
    { ...samples.fanout_start, plan: [{ item: "a", call: 1, request_bytes: 2, request_sha256: HASH, extra: true }] },
    { ...samples.fanout_start, received: { ...(samples.fanout_start["received"] as Record<string, unknown>), extra: true } },
    { ...samples.subflow_call, output: { ...(samples.subflow_call["output"] as Record<string, unknown>), extra: true } },
    { ...providerTransportEvent({ ts: TS, identity: IDENTITY, transport: "websocket", source: "requested" }), error: { message: "extra" } },
    { ...checkEvent({ ts: TS, identity: IDENTITY, check: "output", exit: 0, capture: "checks/output.txt" }), file: "gate.sh" },
    { ...toolCallEvent({ ts: TS, identity: IDENTITY, tool: "clean-temp", decision: "clean" }), reason: "extra" },
    { ...subflowCallEvent({ ts: TS, identity: IDENTITY, call: 1, flow: "child", depth: 1, started: false }), child: "subflows/1" },
  ];
  for (const mutation of mutations) expect(recordEventShape(mutation), String(mutation["event"])).toBeDefined();
});

test("the reader schema accepts every current constructor and its conditional forms", () => {
  const events: Record<string, unknown>[] = [
    runStartEvent({ ts: TS, run: RUN, assembly: "review", assemblyHash: HASH, flow: "main",
      request: { path: "request.txt", sha256: HASH, bytes: 4, via: "argument" }, workdir: "/workspace",
      installationId: "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8",
      provenance: { runtimeSource: "checkout", runtimeDigest: "abc", lockSha256: HASH, node: "v24",
        providerAdapter: "pi", runtimeTreeSha256: HASH, modelSource: "scripted" } }),
    runEndEvent({ ts: TS, exit: 0, cause: "success" }),
    stageCarriedEvent({ ts: TS, identity: IDENTITY, from: RUN, output: OUTPUT }),
    stageStartEvent({ ts: TS, identity: IDENTITY, received: [{ name: "request.txt", path: "request.txt", sha256: HASH }],
      options: [{ name: "timeout", value: 10, rung: "stage" }],
      slots: { pwd: "/workspace", input: "/input", output: "/output", tmp: "/workspace/tmp", skills: "/skills" },
      workdir: { authored: null, resolved: "." }, session: "stages/01-work/1/session.jsonl",
      tools: [{ name: "read", description: "Read a file" }], skills: [{ name: "review", source: "stage-local" }],
      access: { read: ["INPUT"] } }),
    promptEvent({ ts: TS, identity: IDENTITY, prompt: [
      { source: "assembly", path: "assembly/ASSEMBLY.md" },
      { source: "workspace", mode: "announce", name: "review", path: "$PWD/.agents/skills/review/SKILL.md" },
      { source: "skill", name: "review", path: "assembly/skills/review/SKILL.md" },
      { source: "harness", system: "stages/01-work/1/system.txt", firstTurn: "stages/01-work/1/first-turn.txt" },
    ] }),
    stageEndEvent({ ts: TS, identity: IDENTITY, exit: 0, cause: "success", output: OUTPUT, sealed: true, judged: true }),
    unreconciledEvent({ ts: TS, identity: IDENTITY, started: TS, stopped: TS }),
    tmpTeardownEvent({ ts: TS, identity: IDENTITY, reason: "cleanup failed" }),
    providerStartEvent({ ts: TS, identity: IDENTITY, provider: "faux", model: "faux-1" }),
    turnEvent({ ts: TS, identity: IDENTITY, provider: "faux", model: "faux-1", input: 1, output: 1,
      cacheRead: 0, cacheWrite: 0, total: 2, stop: "stop" }),
    providerRetryEvent({ ts: TS, identity: IDENTITY, attempt: 2, delayMs: 10 }),
    providerTransportEvent({ ts: TS, identity: IDENTITY, transport: "websocket", source: "requested" }),
    providerTransportEvent({ ts: TS, identity: IDENTITY, transport: "sse", source: "diagnostic",
      configuredTransport: "websocket", fallbackTransport: "sse", eventsEmitted: false, phase: "open",
      error: { name: "Error", message: "failed", code: "ECONNRESET" } }),
    gateStartEvent({ ts: TS, identity: IDENTITY, file: "gate/01-test.sh", sha256: HASH }),
    checkEvent({ ts: TS, identity: IDENTITY, check: "gate", exit: 0,
      capture: "stages/01-work/1/1/checks/gate.txt", file: "gate/01-test.sh", sha256: HASH }),
    toolCallEvent({ ts: TS, identity: IDENTITY, tool: "mark", decision: "skipped", item: 1,
      evidence: "checked", reason: "not applicable" }),
    toolCallEvent({ ts: TS, identity: IDENTITY, tool: "refuse", decision: "refuse", reason: "cannot continue" }),
    toolCallEvent({ ts: TS, identity: IDENTITY, tool: "continue", decision: "stop", reason: "done" }),
    toolCallEvent({ ts: TS, identity: IDENTITY, tool: "select", decision: "safe", reason: "safer" }),
    toolCallEvent({ ts: TS, identity: IDENTITY, tool: "clean-temp", decision: "clean" }),
    toolCallEvent({ ts: TS, identity: IDENTITY, tool: "fault", decision: "fault", reason: "broken" }),
    toolDeniedEvent({ ts: TS, identity: IDENTITY, tool: "write", boundary: "OUTPUT" }),
    subflowCallEvent({ ts: TS, identity: IDENTITY, call: 1, flow: "child", depth: 1, started: true,
      input: { text: "", sha256: HASH, bytes: 0 }, child: "stages/01-work/1/1/subflows/1", exit: 0, cause: "success" }),
    subflowCallEvent({ ts: TS, identity: IDENTITY, call: 2, flow: "child", depth: 1, started: true,
      input: { path: "stages/01-work/1/1/subflows/2/request.txt", sha256: HASH, bytes: 2 },
      child: "stages/01-work/1/1/subflows/2", reason: "child machinery failed" }),
    subflowCallEvent({ ts: TS, identity: IDENTITY, call: 3, flow: "child", depth: 1, started: false, reason: "limit" }),
    choseEvent({ ts: TS, identity: IDENTITY, chose: "safe", declined: ["fast"], reason: "safer" }),
    loopDoneEvent({ ts: TS, identity: IDENTITY, repeats: 1, endedBy: "limit" }),
    parallelDoneEvent({ ts: TS, identity: IDENTITY, width: 2, concurrent: 1,
      branches: [{ branch: "a", started: true, exit: 0, cause: "success" }, { branch: "b", started: false }] }),
    fanoutStartEvent({ ts: TS, identity: IDENTITY, received: OUTPUT, items: "jobs", subflow: "child", width: 1,
      maxItems: 2, manifestBytes: 10, manifestSha256: HASH,
      plan: [{ item: "a", call: 1, request_bytes: 10, request_sha256: HASH }] }),
    subflowCallEvent({ ts: TS, identity: IDENTITY, call: 1, flow: "child", depth: 1, started: true,
      input: { path: "stages/01-work/1/1/subflows/1/request.json", sha256: HASH, bytes: 10 },
      child: "stages/01-work/1/1/subflows/1", exit: 0, cause: "success", via: "fanout", item: "a",
      output: { path: "stages/01-work/1/1/subflows/1/stages/01-answer/1/1/output.txt", sha256: HASH } }),
    fanoutDoneEvent({ ts: TS, identity: IDENTITY, exit: 0, cause: "success", concurrent: 1 }),
    hookEvent({ ts: TS, identity: IDENTITY, hook: "before", exit: 0,
      capture: "stages/01-work/1/1/hooks/before.txt", sha256: HASH }),
    hashDriftEvent({ ts: TS, file: "gate/01-test.sh", expected: HASH, actual: "b".repeat(64) }),
    signalEvent({ ts: TS, signal: 15, name: "SIGTERM" }),
  ];
  for (const event of events) {
    const label = typeof event["event"] === "string" ? event["event"] : "event";
    expect(recordEventShape(event), label).toBeUndefined();
  }
});

test("the reader schema rejects missing required fields and broken conditional groups", () => {
  const missing: [string, Record<string, unknown>, string][] = [
    ["run_start", start(), "request"],
    ["run_end", runEndEvent({ ts: TS, exit: 0, cause: "success" }), "cause"],
    ["stage_carried", stageCarriedEvent({ ts: TS, identity: IDENTITY, from: RUN }), "from"],
    ["stage_start", opened(), "received"],
    ["prompt", promptEvent({ ts: TS, identity: IDENTITY, prompt: [] }), "prompt"],
    ["stage_end", stageEndEvent({ ts: TS, identity: IDENTITY, exit: 2, cause: "fault" }), "exit"],
    ["unreconciled", unreconciledEvent({ ts: TS, identity: IDENTITY, started: TS, stopped: TS }), "stopped"],
    ["tmp_teardown", tmpTeardownEvent({ ts: TS, reason: "failed" }), "reason"],
    ["provider_start", providerStartEvent({ ts: TS, identity: IDENTITY, provider: "faux", model: "faux-1" }), "provider"],
    ["turn", turnEvent({ ts: TS, identity: IDENTITY, provider: "faux", model: "faux-1", input: 1, output: 1,
      cacheRead: 0, cacheWrite: 0, total: 2, stop: "stop" }), "total"],
    ["provider_retry", providerRetryEvent({ ts: TS, identity: IDENTITY, attempt: 1, delayMs: 1 }), "attempt"],
    ["provider_transport", providerTransportEvent({ ts: TS, identity: IDENTITY, transport: "websocket", source: "requested" }), "transport"],
    ["gate_start", gateStartEvent({ ts: TS, identity: IDENTITY, file: "gate.sh", sha256: HASH }), "file"],
    ["check", checkEvent({ ts: TS, identity: IDENTITY, check: "output", exit: 0, capture: "checks/output.txt" }), "capture"],
    ["tool_call", toolCallEvent({ ts: TS, identity: IDENTITY, tool: "mark", decision: "done", item: 1, evidence: "done" }), "evidence"],
    ["tool_denied", toolDeniedEvent({ ts: TS, identity: IDENTITY, tool: "read", boundary: "INPUT" }), "boundary"],
    ["subflow_call", subflowCallEvent({ ts: TS, identity: IDENTITY, call: 1, flow: "child", depth: 1, started: false }), "call"],
    ["chose", choseEvent({ ts: TS, identity: IDENTITY, chose: "safe", declined: [], reason: "safe" }), "chose"],
    ["loop_done", loopDoneEvent({ ts: TS, identity: IDENTITY, repeats: 1, endedBy: "limit" }), "repeats"],
    ["parallel_done", parallelDoneEvent({ ts: TS, identity: IDENTITY, width: 1, concurrent: 0, branches: [] }), "width"],
    ["fanout_start", fanoutStartEvent({ ts: TS, identity: IDENTITY, received: OUTPUT, items: "jobs", subflow: "child", width: 1,
      maxItems: 1, manifestBytes: 2, manifestSha256: HASH, plan: [] }), "plan"],
    ["fanout_done", fanoutDoneEvent({ ts: TS, identity: IDENTITY, exit: 0, cause: "success", concurrent: 1 }), "concurrent"],
    ["hook", hookEvent({ ts: TS, identity: IDENTITY, hook: "before", exit: 0, capture: "hooks/before.txt", sha256: HASH }), "sha256"],
    ["hash_drift", hashDriftEvent({ ts: TS, file: "gate.sh", expected: HASH, actual: HASH }), "actual"],
    ["signal", signalEvent({ ts: TS, signal: 15, name: "SIGTERM" }), "signal"],
  ];
  for (const [label, event, field] of missing) {
    const mutation = Object.fromEntries(Object.entries(event).filter(([key]) => key !== field));
    expect(recordEventShape(mutation), `${label}.${field}`).toBeDefined();
  }

  const broken = [
    { ...start(), runtime_source: "checkout" },
    { ...opened(), slots: { pwd: "/w", input: "/i", output: "/o", tmp: "/workspace/tmp", skills: "/s", extra: "/x" } },
    { ...opened(), slots: { pwd: "/w", input: "/i", output: "/o", tmp: "/workspace/tmp", skills: "/s", subflows: 7 } },
    { ...promptEvent({ ts: TS, identity: IDENTITY, prompt: [{ source: "request", path: "request.txt" }] }),
      prompt: [{ source: "request", path: "request.txt", name: "extra" }] },
    { ...providerTransportEvent({ ts: TS, identity: IDENTITY, transport: "websocket", source: "requested" }),
      configured_transport: "websocket" },
    { ...checkEvent({ ts: TS, identity: IDENTITY, check: "output", exit: 0, capture: "checks/output.txt" }),
      file: "gate.sh", sha256: HASH },
    { ...toolCallEvent({ ts: TS, identity: IDENTITY, tool: "clean-temp", decision: "clean" }), reason: "extra" },
    { ...subflowCallEvent({ ts: TS, identity: IDENTITY, call: 1, flow: "child", depth: 1, started: false }),
      child: "subflows/1" },
    { ...parallelDoneEvent({ ts: TS, identity: IDENTITY, width: 1, concurrent: 0, branches: [] }),
      branches: [{ branch: "a", started: false, exit: 0 }] },
  ];
  for (const event of broken) expect(recordEventShape(event), event["event"]).toBeDefined();
});

test("the writer oracle rejects malformed FANOUT relationships", () => {
  const started = fanoutStartEvent({ ts: TS, identity: IDENTITY, received: OUTPUT, items: "jobs", subflow: "child", width: 1,
    maxItems: 2, manifestBytes: 10, manifestSha256: HASH,
    plan: [
      { item: "a", call: 1, request_bytes: 10, request_sha256: HASH },
      { item: "b", call: 2, request_bytes: 10, request_sha256: HASH },
    ] });
  const call = subflowCallEvent({ ts: TS, identity: IDENTITY, call: 1, flow: "child", depth: 1, started: true,
    input: { path: "stages/01-work/1/1/subflows/1/request.json", sha256: HASH, bytes: 10 },
    child: "stages/01-work/1/1/subflows/1", exit: 0, cause: "success", via: "fanout", item: "a",
    output: { path: "stages/01-work/1/1/subflows/1/stages/01-answer/1/1/output.txt", sha256: HASH } });
  const mutations: Record<string, unknown>[] = [
    { ...started, repeat: 1 },
    { ...started, width: 3 },
    { ...started, plan: [started.plan[1], started.plan[0]] },
    { ...started, plan: [{ ...started.plan[0], call: 2 }, started.plan[1]] },
    { ...started, plan: [{ ...started.plan[0] }, { ...started.plan[1], item: "a" }] },
    { ...call, repeat: 1 },
    { ...call, exit: 1, cause: "rejected" },
    { ...fanoutDoneEvent({ ts: TS, identity: IDENTITY, exit: 0, cause: "success", concurrent: 1 }), selected: "a" },
    fanoutDoneEvent({ ts: TS, identity: IDENTITY, exit: 1, cause: "rejected", concurrent: 1 }),
  ];
  for (const event of mutations) expect(recordEventShape(event), String(event["event"])).toBeDefined();
});

test("stage identities and relative paths use the writer's normalized relative-path rule", () => {
  for (const stage of ["../01-work", "01-work/../02-work", "/01-work", "01-work\\02-work", "01-work\u0000hidden"]) {
    expect(recordEventShape({ ...opened(), stage }), stage).toContain("legal stage identity");
  }
  for (const capture of ["../checks/output.txt", "checks/../output.txt", "checks/output.txt\u0000hidden"]) {
    expect(recordEventShape({ ...checkEvent({ ts: TS, identity: IDENTITY, check: "output", exit: 0,
      capture: "checks/output.txt" }), capture }), capture).toContain("relationship");
  }
});
