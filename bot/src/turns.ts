// The agent's turns: which control tools are live for one, how long one may
// take, and how a settled turn is read. The budget is per stage, not per turn
// (stage.md), so it is carried across every send-back in one `AgentBudget`.
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { DriverClock } from "./process.ts";
import { CONTROL_TOOLS } from "./record-events.ts";
import type { Cause } from "./spine.ts";
import { sendBackPrompt } from "./prompt.ts";
import { signaled, type RuntimeInput } from "./attempt.ts";
export interface AgentBudget { milliseconds: number; expired: boolean; abandoned?: AbandonedPrompt }
// A prompt the guard abandoned (ticket 0028): `settled` flips if the harness
// ever settles it; a terminal writer finding it false records the ghost.
interface AbandonedPrompt { started: string; stopped: string; settled: boolean }
const CONTROL_NAMES = new Set<string>(CONTROL_TOOLS);
const CONTINUE_TRUNCATED = "Continue from the point where your response was truncated.";
// The abort is a request the provider may ignore: the expiry promise bounds
// the prompt await even when the harness never settles (0017 F1).
function promptGuard(input: RuntimeInput, budget: AgentBudget, clock: DriverClock, remaining: number): { expiry: Promise<"timeout" | "signal">; timer: unknown; release: () => void } {
  let expire = (_ending: "timeout" | "signal"): void => undefined;
  const expiry = new Promise<"timeout" | "signal">((resolve) => { expire = resolve; });
  const timer = clock.setTimeout(() => {
    budget.expired = true;
    void input.harness.abort().then(undefined, () => undefined);
    expire("timeout");
  }, remaining);
  const onAbort = (): void => {
    void input.harness.abort().then(undefined, () => undefined);
    expire("signal");
  };
  input.signal?.abort.addEventListener("abort", onAbort, { once: true });
  return { expiry, timer, release: () => input.signal?.abort.removeEventListener("abort", onAbort) };
}
function abandon(budget: AgentBudget, message: AssistantMessage | "timeout" | "signal", pending: Promise<AssistantMessage>, started: string, stopped: string): void { if (typeof message !== "string") return; const abandoned: AbandonedPrompt = { started, stopped, settled: false }; budget.abandoned = abandoned; const settle = (): void => { abandoned.settled = true; }; void pending.then(settle, settle); }
function promptEnding(input: RuntimeInput, budget: AgentBudget): "timeout" | "signal" | undefined { if (signaled(input)) return "signal"; return budget.expired ? "timeout" : undefined; }
export async function prompt(input: RuntimeInput, text: string, budget: AgentBudget): Promise<AssistantMessage | "timeout" | "signal"> {
  let next = text;
  for (;;) {
    if (signaled(input)) return "signal";
    const remaining = input.config.timeoutMs - budget.milliseconds; if (remaining <= 0) return "timeout";
    const clock = input.agentClock ?? input.clock;
    const start = clock.milliseconds();
    const guard = promptGuard(input, budget, clock, remaining);
    const promptedAt = input.clock.timestamp();
    const pending = input.harness.prompt(next);
    void pending.then(undefined, () => undefined);
    const message = await Promise.race([pending, guard.expiry]);
    clock.clearTimeout(guard.timer);
    guard.release();
    budget.milliseconds += Math.max(0, clock.milliseconds() - start);
    abandon(budget, message, pending, promptedAt, input.clock.timestamp());
    const terminal = promptEnding(input, budget); if (terminal !== undefined) return terminal; if (typeof message === "string") return message;
    if (message.stopReason !== "length") return message; next = sendBackPrompt(Buffer.from(CONTINUE_TRUNCATED));
  }
}
export async function setControlTools(input: RuntimeInput, names: string[]): Promise<void> {
  const ordinary = input.harness.getTools().map((tool) => tool.name).filter((name) => !CONTROL_NAMES.has(name));
  await input.harness.setActiveTools([...ordinary, ...names]);
}
function fault(message: AssistantMessage, fallback?: string): { cause: "fault"; exit: 2; reason?: string } {
  const reason = message.errorMessage ?? fallback;
  return { cause: "fault", exit: 2, ...(reason === undefined ? {} : { reason }) };
}
export function messageCause(message: AssistantMessage | "timeout" | "signal", signalExit = 2): { cause: Cause; exit: number; reason?: string } | undefined {
  if (typeof message === "string") return { cause: message, exit: message === "signal" ? signalExit : 1 };
  if (message.stopReason === "stop" || message.stopReason === "toolUse") return undefined;
  if (message.stopReason === "aborted") return fault(message, "The harness aborted unexpectedly.");
  if (message.stopReason === "error") return fault(message);
  throw new TypeError(`prompt() resolved with impossible stop reason ${message.stopReason}`);
}
