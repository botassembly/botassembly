import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { Harness, HarnessEvent, HarnessMessage } from "./harness.ts";
import { mapping } from "./model.ts";
import {
  CONTROL_TOOLS,
  providerStartEvent,
  providerTransportEvent,
  subflowCallEvent,
  toolCallEvent,
  turnEvent,
  type ControlTool,
  type StageIdentity,
  type SubflowInput,
} from "./record-events.ts";
import { hashBytes, type RecordWriter } from "./record.ts";
import { CAUSES, type Cause } from "./spine.ts";

const TRACKED_TOOLS = new Set<string>([...CONTROL_TOOLS, "subflow"]);
const CAUSE_WORDS = new Set<string>(CAUSES);

export interface PiTapContext {
  writer: RecordWriter;
  identity: StageIdentity;
  now: () => string;
}

// The context's identity is shared with the runtime, which mutates `retry` at
// the attempt boundary (nextAttempt). An event belongs to the attempt that
// produced it (record.md), so each pending tool and each turn captures a copy
// of the identity at its own honest start.
interface PendingTool {
  name: string;
  args: unknown;
  identity: StageIdentity;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!mapping(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}
function number(value: unknown, label: string): number {
  if (typeof value !== "number") throw new TypeError(`${label} must be a number`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : string(value, label);
}
function transport(value: unknown, label: string): "websocket" | "sse" { const held = string(value, label); if (held !== "websocket" && held !== "sse") throw new TypeError(`${label} must be websocket or sse`); return held; }

function assistant(message: HarnessMessage): message is AssistantMessage {
  return message.role === "assistant";
}

function resultDetails(result: unknown): unknown {
  return object(result, "tool result")["details"];
}

function combinedValue(args: Record<string, unknown>, details: Record<string, unknown>, name: string): unknown {
  return details[name] ?? args[name];
}

function controlDecision(
  tool: ControlTool,
  args: Record<string, unknown>,
  details: Record<string, unknown>,
): { decision: string; item?: number } {
  if (tool === "mark") {
    return {
      decision: string(combinedValue(args, details, "state"), "mark state"),
      item: number(combinedValue(args, details, "item"), "mark item"),
    };
  }
  if (tool === "continue") {
    return { decision: string(combinedValue(args, details, "answer"), "continue answer") };
  }
  if (tool === "select") {
    return { decision: string(combinedValue(args, details, "name"), "select name") };
  }
  if (tool === "clean-temp") return { decision: "clean" };
  if (tool === "fault") return { decision: "fault" };
  return { decision: "refuse" };
}

function controlEvent(
  context: PiTapContext,
  pending: PendingTool,
  result: unknown,
) {
  const tool = pending.name as ControlTool;
  const args = object(pending.args, `${tool} arguments`);
  const held = resultDetails(result);
  const details = held === undefined ? {} : object(held, `${tool} result details`);
  const decision = controlDecision(tool, args, details);
  const evidence = tool === "mark"
    ? string(combinedValue(args, details, "evidence"), "mark evidence")
    : undefined;
  const reason = optionalString(combinedValue(args, details, "reason"), `${tool} reason`);
  return toolCallEvent({
    ts: context.now(),
    identity: pending.identity,
    tool,
    decision: decision.decision,
    ...(evidence === undefined ? {} : { evidence }),
    ...(reason === undefined ? {} : { reason }),
    ...(decision.item === undefined ? {} : { item: decision.item }),
  });
}

function cause(value: unknown): Cause {
  const held = string(value, "subflow cause");
  if (!CAUSE_WORDS.has(held)) throw new TypeError(`Unknown subflow cause: ${held}`);
  return held as Cause;
}

function subflowInput(call: Record<string, unknown>, detail: Record<string, unknown>): SubflowInput | undefined {
  const text = call["input"];
  if (typeof text === "string") {
    return { text, sha256: hashBytes(text), bytes: Buffer.byteLength(text) };
  }
  const held = detail["input"];
  const normalized = held === undefined ? detail : object(held, "subflow normalized input");
  // An input-file that never became bytes (ticket 0018/0020) has nothing to
  // hash: the call's event still exists, with started:false and no input.
  if (normalized["sha256"] === undefined && detail["started"] === false) return undefined;
  const path = optionalString(normalized["path"], "subflow input path")
    ?? string(call["input-file"], "subflow input-file");
  return {
    path,
    sha256: string(normalized["sha256"], "subflow input sha256"),
    bytes: number(normalized["bytes"], "subflow input bytes"),
  };
}

export function subflowEvent(
  context: PiTapContext,
  identity: StageIdentity,
  call: Record<string, unknown>,
  detail: Record<string, unknown>,
  index: number,
) {
  const started = boolean(detail["started"], "subflow started");
  const input = subflowInput(call, detail);
  const common = {
    ts: context.now(),
    identity,
    call: detail["call"] === undefined ? index + 1 : number(detail["call"], "subflow call"),
    flow: string(call["flow"], "subflow flow"),
    depth: number(detail["depth"], "subflow depth"),
  };
  const reason = optionalString(detail["reason"], "subflow reason");
  if (!started) {
    return subflowCallEvent({
      ...common,
      ...(input === undefined ? {} : { input }),
      started,
      ...(reason === undefined ? {} : { reason }),
    });
  }
  if (input === undefined) throw new TypeError("a started subflow call must carry its input");
  const child = string(detail["child"], "subflow child");
  if (detail["exit"] === undefined) return subflowCallEvent({ ...common, input, started, child, ...(reason === undefined ? {} : { reason }) });
  return subflowCallEvent({
    ...common,
    input,
    started,
    exit: number(detail["exit"], "subflow exit"),
    cause: cause(detail["cause"]),
    child,
    ...(reason === undefined ? {} : { reason }),
  });
}
async function appendSubflows(context: PiTapContext, pending: PendingTool, result: unknown): Promise<void> {
  const args = object(pending.args, "subflow arguments");
  const calls = args["calls"];
  const details = resultDetails(result);
  if (!Array.isArray(calls) || !Array.isArray(details) || calls.length !== details.length) {
    throw new TypeError("subflow calls and result details must be equal-length arrays");
  }
  for (let index = 0; index < calls.length; index += 1) {
    const call = object(calls[index], "subflow call");
    const detail = object(details[index], "subflow result detail");
    await context.writer.append(subflowEvent(context, pending.identity, call, detail, index));
  }
}
function appendProviderTransport(context: PiTapContext, identity: StageIdentity, message: AssistantMessage): Promise<void> | undefined {
  if (message.provider !== "openai-codex") return undefined;
  const diagnostic = message.diagnostics?.find((held) => held.type === "provider_transport_failure");
  if (diagnostic === undefined) return context.writer.append(providerTransportEvent({ ts: context.now(), identity, transport: "websocket", source: "requested" }));
  const details = object(diagnostic.details, "provider transport failure details");
  const configuredTransport = transport(details["configuredTransport"], "configured transport");
  const fallbackTransport = details["fallbackTransport"] === undefined ? undefined : transport(details["fallbackTransport"], "fallback transport");
  if (diagnostic.error === undefined) throw new TypeError("provider transport failure error must be an object");
  return context.writer.append(providerTransportEvent({ ts: context.now(), identity, transport: fallbackTransport ?? configuredTransport, source: "diagnostic", configuredTransport, ...(fallbackTransport === undefined ? {} : { fallbackTransport }), eventsEmitted: boolean(details["eventsEmitted"], "provider transport events emitted"), phase: string(details["phase"], "provider transport phase"), error: { ...(diagnostic.error.name === undefined ? {} : { name: diagnostic.error.name }), message: diagnostic.error.message, ...(diagnostic.error.code === undefined ? {} : { code: diagnostic.error.code }) } }));
}
function appendTurn(context: PiTapContext, identity: StageIdentity, message: AssistantMessage): Promise<void> {
  if (message.stopReason === "pending") throw new TypeError("turn_end cannot carry a pending stop reason");
  return context.writer.append(turnEvent({
    ts: context.now(),
    identity,
    provider: message.provider,
    model: message.model,
    input: message.usage.input,
    output: message.usage.output,
    cacheRead: message.usage.cacheRead,
    cacheWrite: message.usage.cacheWrite,
    total: message.usage.totalTokens,
    stop: message.stopReason,
  }));
}
export function createPiTap(context: PiTapContext): (event: HarnessEvent) => Promise<void> {
  const pending = new Map<string, PendingTool>();
  let turn = { ...context.identity };
  return async (event) => {
    if (event.type === "turn_start") {
      turn = { ...context.identity };
      return;
    }
    if (event.type === "turn_end") {
      if (assistant(event.message)) { await appendProviderTransport(context, turn, event.message); await appendTurn(context, turn, event.message); }
      return;
    }
    if (event.type === "tool_execution_start") {
      if (TRACKED_TOOLS.has(event.toolName)) {
        pending.set(event.toolCallId, { name: event.toolName, args: event.args, identity: { ...context.identity } });
      }
      return;
    }
    if (event.type !== "tool_execution_end") return;
    const started = pending.get(event.toolCallId);
    if (started === undefined) return;
    pending.delete(event.toolCallId);
    // An errored end never executed (unknown tool, rejected arguments): the
    // harness feeds that back to the model; the record shows only what ran.
    if (event.isError) return;
    if (started.name === "subflow") await appendSubflows(context, started, event.result);
    else await context.writer.append(controlEvent(context, started, event.result));
  };
}
// Unsubscribing only removes the listener (ticket 0141): a handler suspended
// at an await keeps running, and its appends could land after the stage's
// closing stage_end. Every dispatch is tracked, and detach settles only when
// the in-flight appends have — the barrier endStage awaits before sealing.
export function attachPiTap<TContext extends object>(
  harness: Harness<TContext>,
  context: PiTapContext,
): () => Promise<void> {
  const handler = createPiTap(context);
  const inflight = new Set<Promise<void>>();
  const tracked = (dispatched: Promise<void>): Promise<void> => {
    const settled = dispatched.then(() => undefined, () => undefined);
    inflight.add(settled);
    void settled.then(() => inflight.delete(settled));
    return dispatched;
  };
  const unsubscribe = harness.subscribe((event) => tracked(handler(event)));
  const removeProviderHook = harness.beforeProviderRequest((event): Promise<void> =>
    tracked(context.writer.append(providerStartEvent({
      ts: context.now(),
      identity: { ...context.identity },
      provider: event.model.provider,
      model: event.model.id,
    }))));
  return async () => {
    unsubscribe();
    removeProviderHook();
    await Promise.all(inflight);
  };
}
