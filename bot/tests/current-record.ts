import { checkEvent, runStartEvent, stageEndEvent, stageStartEvent, turnEvent,
  type StageIdentity } from "../src/record-events.ts";

const HASH = "a".repeat(64);

/** Supply the current writer's required fields around the facts a reader test
 * cares about. Semantic-boundary tests write raw events instead. */
function currentRunStart(event: Record<string, unknown>): Record<string, unknown> {
  const ts = event["ts"], run = event["run"], assembly = event["assembly"];
  if (typeof ts !== "string" || typeof run !== "string" || typeof assembly !== "string") return event;
  const oldHash = event["assemblyHash"], newHash = event["assembly_hash"];
  const assemblyHash = typeof newHash === "string" ? newHash : typeof oldHash === "string" ? oldHash : HASH;
  const flow = typeof event["flow"] === "string" ? event["flow"] : undefined;
  const record = runStartEvent({ ts, run, assembly, assemblyHash,
    ...(flow === undefined ? {} : { flow }), request: { path: "request.txt", sha256: HASH, bytes: 0, via: "argument" } });
  return { ...record, ...event, ...(typeof event["record"] === "number" ? { record: event["record"] } : {}) };
}

function currentStageStart(event: Record<string, unknown>): Record<string, unknown> {
  const ts = event["ts"], stage = event["stage"], retry = event["retry"], repeat = event["repeat"];
  if (typeof ts !== "string" || typeof stage !== "string" || typeof retry !== "number") return event;
  const started = stageStartEvent({ ts, identity: { stage, retry, ...(typeof repeat === "number" ? { repeat } : {}) },
    received: [], options: [], session: typeof event["session"] === "string" ? event["session"]
      : `stages/${stage}/${String(typeof repeat === "number" ? repeat : 1)}/session.jsonl`,
    workdir: { authored: null, resolved: "." }, tools: [], skills: [] });
  return { ...started, ...event, received: Array.isArray(event["received"]) ? event["received"] : [],
    options: Array.isArray(event["options"]) ? event["options"] : [] };
}

function currentEvent(event: Record<string, unknown>): Record<string, unknown> {
  if (event["event"] === "run_start") return currentRunStart(event);
  return event["event"] === "stage_start" ? currentStageStart(event) : event;
}

interface OpenStage {
  identity: StageIdentity;
  work: boolean;
  outputPassed: boolean;
  chose: boolean;
}

const workEvents = new Set(["turn", "provider_retry", "provider_transport", "tool_call", "tool_denied"]);

function identityOf(event: Record<string, unknown>): StageIdentity | undefined {
  const stage = event["stage"], retry = event["retry"], repeat = event["repeat"];
  return typeof stage === "string" && typeof retry === "number"
    ? { stage, retry, ...(typeof repeat === "number" ? { repeat } : {}) }
    : undefined;
}

function identityKey(identity: StageIdentity): string {
  return `${identity.stage}\0${String(identity.repeat ?? 1)}\0${String(identity.retry)}`;
}

function stagePath(identity: StageIdentity): string {
  return `stages/${identity.stage}/${String(identity.repeat ?? 1)}/${String(identity.retry)}`;
}

function syntheticTurn(ts: string, identity: StageIdentity): Record<string, unknown> {
  return turnEvent({ ts, identity, provider: "fixture", model: "fixture", input: 0, output: 0,
    cacheRead: 0, cacheWrite: 0, total: 0, stop: "stop" });
}

function syntheticOutputCheck(ts: string, identity: StageIdentity): Record<string, unknown> {
  return checkEvent({ ts, identity, check: "output", exit: 0, capture: `${stagePath(identity)}/checks/output.txt` });
}

function sealedStageEnd(event: Record<string, unknown>, identity: StageIdentity): Record<string, unknown> {
  return event["output"] === undefined
    ? { ...event, output: { path: `${stagePath(identity)}/output.txt`, sha256: HASH }, sealed: true, judged: true }
    : event;
}

function rememberStage(open: Map<string, OpenStage>, event: Record<string, unknown>, identity: StageIdentity | undefined): void {
  if (event["event"] !== "stage_start" || identity === undefined) return;
  open.set(identityKey(identity), { identity, work: false, outputPassed: false, chose: false });
}

function observeStage(held: OpenStage | undefined, event: Record<string, unknown>): void {
  if (held === undefined) return;
  const name = String(event["event"]);
  if (workEvents.has(name)) held.work = true;
  if (name === "chose") { held.chose = true; held.work = true; }
  if (name === "check" && event["check"] === "output" && event["exit"] === 0) held.outputPassed = true;
}

function completedStage(held: OpenStage | undefined, event: Record<string, unknown>): Record<string, unknown>[] | undefined {
  if (held === undefined || event["event"] !== "stage_end" || event["cause"] !== "success" || event["exit"] !== 0) {
    return undefined;
  }
  const ts = typeof event["ts"] === "string" ? event["ts"] : "2026-01-01T00:00:00.000Z";
  return [
    ...(held.work ? [] : [syntheticTurn(ts, held.identity)]),
    ...(held.chose || held.outputPassed ? [] : [syntheticOutputCheck(ts, held.identity)]),
    held.chose ? event : sealedStageEnd(event, held.identity),
  ];
}

/** Older reader tests state only the facts they inspect. Complete their successful stages with current writer facts. */
function completeSuccessfulStages(events: Record<string, unknown>[]): Record<string, unknown>[] {
  const completed: Record<string, unknown>[] = [];
  const open = new Map<string, OpenStage>();
  for (const event of events) {
    const identity = identityOf(event);
    rememberStage(open, event, identity);
    const held = identity === undefined ? undefined : open.get(identityKey(identity));
    observeStage(held, event);
    const replacement = completedStage(held, event);
    if (replacement !== undefined && held !== undefined) {
      completed.push(...replacement);
      open.delete(identityKey(held.identity));
      continue;
    }
    completed.push(event);
    if (held !== undefined && event["event"] === "stage_end") open.delete(identityKey(held.identity));
  }
  return completed;
}

function completeSuccessfulRun(events: Record<string, unknown>[]): Record<string, unknown>[] {
  const ending = events.findIndex((event) => event["event"] === "run_end");
  const event = events[ending];
  if (event === undefined || event["cause"] !== "success") return events;
  const hasResult = events.slice(0, ending).some((event) =>
    event["event"] === "stage_end" || event["event"] === "loop_done" || event["event"] === "parallel_done");
  if (hasResult) return events;
  const ts = typeof event["ts"] === "string" ? event["ts"] : "2026-01-01T00:00:00.000Z";
  const identity = { stage: typeof events[0]?.["flow"] === "string" ? "01-fixture" : "assembly", retry: 1 };
  return [
    ...events.slice(0, ending),
    stageStartEvent({ ts, identity, received: [], options: [], session: `stages/${identity.stage}/1/session.jsonl`,
      workdir: { authored: null, resolved: "." }, tools: [], skills: [] }),
    syntheticTurn(ts, identity),
    syntheticOutputCheck(ts, identity),
    stageEndEvent({ ts, identity, exit: 0, cause: "success",
      output: { path: `${stagePath(identity)}/output.txt`, sha256: HASH }, sealed: true, judged: true }),
    ...events.slice(ending),
  ];
}

export function currentRecord(events: Record<string, unknown>[]): string {
  const current = events.map((event) => currentEvent(event));
  return `${completeSuccessfulRun(completeSuccessfulStages(current)).map((event) => JSON.stringify(event)).join("\n")}\n`;
}

export function successfulStageEvents(identity: StageIdentity, ts: string, session?: string): Record<string, unknown>[] {
  const directory = `stages/${identity.stage}/${String(identity.repeat ?? 1)}`;
  return [
    stageStartEvent({ ts: `${ts}.000Z`, identity, received: [], options: [],
      session: session ?? `${directory}/session.jsonl`, workdir: { authored: null, resolved: "." }, tools: [], skills: [] }),
    turnEvent({ ts: `${ts}.100Z`, identity, provider: "faux", model: "faux-1", input: 1, output: 1,
      cacheRead: 0, cacheWrite: 0, total: 2, stop: "stop" }),
    checkEvent({ ts: `${ts}.200Z`, identity, check: "output", exit: 0, capture: `${directory}/1/checks/output.txt` }),
    stageEndEvent({ ts: `${ts}.300Z`, identity, exit: 0, cause: "success",
      output: { path: `${directory}/1/output.txt`, sha256: HASH }, sealed: true, judged: true }),
  ];
}
