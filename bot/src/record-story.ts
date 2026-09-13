import { isRecordEventName } from "./record-events.ts";
import { CAUSES } from "./spine.ts";

export type RecordClassification = "valid" | "incomplete" | "invalid";
export interface StoryClassification { classification: RecordClassification; rejected?: { line: number; rule: string } }
type Event = Record<string, unknown>;

const causes = new Set<string>(CAUSES);
const identityEvents = new Set(["stage_carried", "stage_start", "prompt", "stage_end", "unreconciled", "provider_start", "turn", "provider_retry", "provider_transport", "gate_start", "check", "tool_call", "tool_denied", "subflow_call", "chose", "loop_done", "parallel_done", "fanout_start", "fanout_done", "hook"]);
const attemptEvents = new Set(["prompt", "unreconciled", "provider_start", "turn", "provider_retry", "provider_transport", "gate_start", "check", "tool_call", "tool_denied", "subflow_call", "chose", "hook"]);
const signals: Record<number, string> = { 1: "SIGHUP", 2: "SIGINT", 15: "SIGTERM" };

interface StoryState { open: Set<string>; closed: Set<string>; containers: Set<string>; fanouts: Set<string>; completedFanouts: Set<string>; signal?: number; pendingSignal?: number; ended: boolean }
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
const eventObject = (value: unknown): value is Event => typeof value === "object" && value !== null && !Array.isArray(value);

function identityKey(event: Event): string | undefined {
  const stage = event["stage"], retry = event["retry"], repeat = event["repeat"];
  if (typeof stage !== "string" || stage.length === 0 || !positiveInteger(retry)) return undefined;
  if (repeat !== undefined && !positiveInteger(repeat)) return undefined;
  return `${stage}\0${repeat === undefined ? "" : String(repeat)}\0${String(retry)}`;
}

function expectedExit(cause: string, code: number): string | undefined {
  const fixed: Record<string, number> = { success: 0, fault: 2 };
  if (fixed[cause] !== undefined) return code === fixed[cause] ? undefined : `${cause} requires exit ${String(fixed[cause])}`;
  if (cause === "timeout") return code === 1 || code === 2 ? undefined : "timeout requires exit 1 or 2";
  if (cause === "signal") return signals[code - 128] === undefined ? "signal requires exit 129, 130, or 143" : undefined;
  return code === 1 ? undefined : `${cause} requires exit 1`;
}

function terminalPair(event: Event): string | undefined {
  const cause = event["cause"], exit = event["exit"];
  if (typeof cause !== "string" || !causes.has(cause)) return "unknown cause";
  if (typeof exit !== "number" || !Number.isSafeInteger(exit) || exit < 0) return "exit is not a non-negative integer";
  return expectedExit(cause, exit);
}

function noteSignalOutcome(state: StoryState, event: Event): string | undefined {
  if (event["cause"] !== "signal") return undefined;
  const exit = event["exit"];
  if (typeof exit !== "number") return "signal outcome has no numeric exit";
  const number = exit - 128;
  if (state.signal !== undefined) return state.signal === number ? undefined : "signal outcome does not match the recorded signal";
  if (state.pendingSignal !== undefined && state.pendingSignal !== number) return "signal outcome conflicts with an earlier pending signal";
  state.pendingSignal = number;
  return undefined;
}

function startAttempt(state: StoryState, key: string): string | undefined {
  if (state.open.has(key)) return "stage attempt started twice";
  if (state.closed.has(key)) return "stage attempt restarted after its end";
  const last = key.lastIndexOf("\0"), series = key.slice(0, last), retry = Number(key.slice(last + 1));
  for (const held of state.open) {
    if (!held.startsWith(`${series}\0`) || Number(held.slice(held.lastIndexOf("\0") + 1)) >= retry) continue;
    state.open.delete(held);
    state.closed.add(held);
  }
  state.open.add(key);
  return undefined;
}

function endAttempt(state: StoryState, event: Event, key: string): string | undefined {
  if (!state.open.has(key)) return "stage_end without its start";
  const pair = terminalPair(event);
  if (pair !== undefined) return `stage_end ${pair}`;
  state.open.delete(key);
  state.closed.add(key);
  return noteSignalOutcome(state, event);
}

function noteParallelRows(state: StoryState, branches: unknown[]): string | undefined {
  for (const row of branches) {
    if (!eventObject(row) || row["started"] !== true) continue;
    const pair = terminalPair(row);
    if (pair !== undefined) return `parallel_done row ${pair}`;
    const signal = noteSignalOutcome(state, row);
    if (signal !== undefined) return signal;
  }
  return undefined;
}

function noteContainer(state: StoryState, event: Event, name: string, key: string): string | undefined {
  const identity = `${name}:${key}`;
  if (state.containers.has(identity)) return `${name} appears twice for one identity`;
  state.containers.add(identity);
  const branches = event["branches"];
  return name === "parallel_done" && Array.isArray(branches) ? noteParallelRows(state, branches) : undefined;
}

function noteSignal(state: StoryState, event: Event): string | undefined {
  if (state.signal !== undefined) return "signal appears at most once";
  const number = event["signal"];
  if (typeof number !== "number" || signals[number] === undefined || event["name"] !== signals[number]) return "signal has an unknown name and number pair";
  if (state.pendingSignal !== undefined && state.pendingSignal !== number) return "outside signal does not match the pending signal requirement";
  state.signal = number;
  delete state.pendingSignal;
  return undefined;
}

function openWorkEnding(state: StoryState, event: Event): string | undefined {
  if (state.open.size === 0 && state.fanouts.size === 0) return undefined;
  const cause = event["cause"], exit = event["exit"];
  const canClose = cause === "signal" || cause === "fault" && exit === 2 || cause === "timeout" && exit === 2;
  if (canClose) return undefined;
  return cause === "success" ? "successful run_end leaves open work" : "open work requires a fault, timeout, or signal ending";
}

function endRun(state: StoryState, event: Event): string | undefined {
  const pair = terminalPair(event);
  if (pair !== undefined) return `run_end ${pair}`;
  if (event["cause"] === "signal" && state.signal === undefined) return "run_end requires the matching outside signal";
  if (state.pendingSignal !== undefined && state.signal === undefined) return "run_end appears before the pending signal requirement";
  if (state.signal !== undefined && (event["cause"] !== "signal" || event["exit"] !== 128 + state.signal)) return "outside signal governs the final run outcome";
  const open = openWorkEnding(state, event);
  if (open !== undefined) return open;
  state.ended = true;
  return undefined;
}

function transitionAttempt(state: StoryState, event: Event, name: string, key: string): string | undefined {
  if (name === "stage_start") return startAttempt(state, key);
  if (name === "stage_end") return endAttempt(state, event, key);
  if (!attemptEvents.has(name)) return undefined;
  if (!state.open.has(key)) return `${name} outside an open stage attempt`;
  if (name !== "subflow_call" || event["cause"] === undefined) return undefined;
  const pair = terminalPair(event);
  return pair === undefined ? noteSignalOutcome(state, event) : `subflow_call ${pair}`;
}

function routedIdentity(name: string, key: string | undefined): key is string {
  return key !== undefined && identityEvents.has(name);
}

function transition(state: StoryState, event: Event, name: string, first: boolean): string | undefined {
  if (state.ended) return name === "run_end" ? "duplicate run_end" : "content follows run_end";
  if (first !== (name === "run_start")) return first ? "run_start must be the first event" : "run_start appears exactly once";
  const key = identityKey(event);
  if (identityEvents.has(name) && key === undefined) return `${name} requires a stage identity`;
  if (routedIdentity(name, key)) return identityTransition(state, event, name, key);
  if (name === "signal") return noteSignal(state, event);
  return name === "run_end" ? endRun(state, event) : undefined;
}

function startFanout(state: StoryState, key: string): string | undefined {
  if (state.fanouts.has(key) || state.completedFanouts.has(key)) return "fanout_start appears twice for one identity";
  state.fanouts.add(key);
  return undefined;
}

function endFanout(state: StoryState, event: Event, key: string): string | undefined {
  if (!state.fanouts.delete(key)) return "fanout_done without its start";
  const pair = terminalPair(event);
  if (pair !== undefined) return `fanout_done ${pair}`;
  state.completedFanouts.add(key);
  return noteSignalOutcome(state, event);
}

function fanoutCall(state: StoryState, event: Event, key: string): string | undefined {
  if (!state.fanouts.has(key)) return "fanout subflow_call outside an open fanout";
  if (event["cause"] === undefined) return undefined;
  const pair = terminalPair(event);
  return pair === undefined ? noteSignalOutcome(state, event) : `subflow_call ${pair}`;
}

function identityTransition(state: StoryState, event: Event, name: string, key: string): string | undefined {
  if (name === "fanout_start") return startFanout(state, key);
  if (name === "fanout_done") return endFanout(state, event, key);
  if (name === "subflow_call" && event["via"] === "fanout") return fanoutCall(state, event, key);
  if (name === "stage_start" || name === "stage_end" || attemptEvents.has(name)) return transitionAttempt(state, event, name, key);
  return name === "loop_done" || name === "parallel_done" ? noteContainer(state, event, name, key) : undefined;
}

function rejected(line: number, rule: string): StoryClassification { return { classification: "invalid", rejected: { line, rule } }; }
function lineNumber(lines: number[] | undefined, index: number): number { return lines?.[index] ?? index + 1; }

function startRule(event: Event, expectedRun: string | undefined): string | undefined {
  if (event["event"] !== "run_start") return undefined;
  if (event["record"] !== 1) return typeof event["record"] === "number" ? `record shape ${String(event["record"])}` : "run_start requires record 1";
  return expectedRun !== undefined && event["run"] !== expectedRun ? "run_start identity must match its enclosing run directory" : undefined;
}

/** Validate the ordering and terminal facts needed for a structurally possible
 * story. Operations validate detailed fields and artifacts when they use them. */
export function classifyStory(events: Event[], sourceLines?: number[], expectedRun?: string, _allowSubflow = false): StoryClassification {
  const first = events[0];
  if (first === undefined) return { classification: "incomplete" };
  const opening = startRule(first, expectedRun);
  if (opening !== undefined) return rejected(lineNumber(sourceLines, 0), opening);
  const state: StoryState = { open: new Set(), closed: new Set(), containers: new Set(), fanouts: new Set(), completedFanouts: new Set(), ended: false };
  for (const [index, event] of events.entries()) {
    const name = event["event"], line = lineNumber(sourceLines, index);
    if (!isRecordEventName(name)) return rejected(line, "unknown event");
    if (typeof event["ts"] !== "string" || !Number.isFinite(Date.parse(event["ts"]))) return rejected(line, `${name} requires a timestamp`);
    const rule = transition(state, event, name, index === 0);
    if (rule !== undefined) return rejected(line, rule);
  }
  return { classification: state.ended ? "valid" : "incomplete" };
}
