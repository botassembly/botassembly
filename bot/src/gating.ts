import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { absoluteCapture, capture, nextAttempt, recordCheck, resolvePromptSources, retainPrompt, signalExit, snapshotOutput, startAttempt, type CommonConfig, type GatingInput, type GatingResult, type WorkConfig } from "./attempt.ts";
import { runChecks } from "./checks.ts";
import { runHook } from "./executables.ts";
import { type AgentBudget, messageCause, prompt, setControlTools } from "./turns.ts";
import { attachPiTap } from "./pi-tap.ts";
import { hashDriftEvent, choseEvent, promptEvent, stageEndEvent, unreconciledEvent } from "./record-events.ts";
import { sealOutput, type PassedOutput } from "./record.ts";
import type { Cause } from "./spine.ts";
import { buildInitialPrompt, questionPrompt, sendBackPrompt } from "./prompt.ts";
import { bytewise, faultReason } from "./model.ts";
import { boundCleanTempPath } from "./tools.ts";

export type { GatingConfig, GatingInput, GatingResult } from "./attempt.ts";

type RuntimeInput = GatingInput & { budget: AgentBudget; detach: () => Promise<void> };
interface Ending { exit: number; cause: Cause; reason?: string; capture?: string; judged: boolean; output?: PassedOutput }

// Every terminal stage_end lands through here (ticket 0028): the tap detaches
// first, so a late-settling abandoned prompt can append nothing after the
// stage's closing line, and an abandonment the runtime never saw settle is
// written down — with its window — before the end it precedes. Detach is a
// barrier (ticket 0141): it settles only when the tap's in-flight appends
// have, so a handler suspended at an await cannot land after the closing line.
async function endStage(input: RuntimeInput, end: Parameters<typeof stageEndEvent>[0]): Promise<void> {
  await input.detach();
  await input.close();
  const abandoned = input.budget.abandoned;
  if (abandoned !== undefined && !abandoned.settled) {
    await input.writer.append(unreconciledEvent({ ts: input.clock.timestamp(), identity: input.identity, started: abandoned.started, stopped: abandoned.stopped }));
  }
  await input.writer.append(stageEndEvent(end));
}

async function afterFailureHook(input: RuntimeInput, ending: Ending, config?: WorkConfig): Promise<Ending> {
  if (config === undefined || ending.cause === "signal") return ending;
  await runHook(input, config, "failure", {
    CAUSE: ending.cause,
    REASON: ending.capture,
  });
  return ending;
}

async function checkExhaustedOutput(input: RuntimeInput, ending: Ending): Promise<void> {
  if (ending.cause !== "exhausted" || ending.output === undefined) return;
  const sealed = await sealOutput(ending.output);
  if (sealed.status === "drifted") {
    await input.writer.append(hashDriftEvent({ ts: input.clock.timestamp(), ...sealed.drift }));
  }
}

async function finish(input: RuntimeInput, ending: Ending, config?: WorkConfig): Promise<GatingResult> {
  await checkExhaustedOutput(input, ending);
  // The snapshot precedes the failure hook (ticket 0032): hooks.md says the
  // failure hook may change nothing, so bytes it writes to $OUTPUT never
  // enter the record as the stage's kept output.
  const snapshot = ending.output === undefined && config !== undefined ? await snapshotOutput(input, config) : undefined;
  const held = await afterFailureHook(input, ending, config);
  const output = held.output?.output ?? snapshot?.passed.output;
  await endStage(input, {
    ts: input.clock.timestamp(), identity: input.identity, exit: held.exit, cause: held.cause,
    ...(held.reason === undefined ? {} : { reason: held.reason }),
    ...(output === undefined ? {} : { output, sealed: false, judged: held.judged }),
  });
  return { exit: held.exit, cause: held.cause, ...(held.reason === undefined ? {} : { reason: held.reason }), ...(output === undefined ? {} : { output }) };
}

async function verifiedOutput(input: RuntimeInput, passed: PassedOutput): Promise<Ending | undefined> {
  const sealed = await sealOutput(passed);
  if (sealed.status === "sealed") return undefined;
  await input.writer.append(hashDriftEvent({ ts: input.clock.timestamp(), ...sealed.drift }));
  return { exit: sealed.exit, cause: sealed.cause, reason: sealed.reason, judged: true, output: passed };
}

async function sealSuccess(input: RuntimeInput, config: WorkConfig, checked: PassedOutput): Promise<GatingResult> {
  const drift = await verifiedOutput(input, checked);
  if (drift !== undefined) return finish(input, drift, config);
  // The tmp-ceiling monitor only sets the fault flag, read at prompt
  // boundaries (ticket 0141): re-read it here, so a breach that landed while
  // the harness was idle — during checks or hooks — is not sealed over.
  if (input.controls.fault !== undefined) return faulted(input, config, checked);
  // Nothing is copied (ticket 0072): the retained candidate is the judged buffer.
  await endStage(input, { ts: input.clock.timestamp(), identity: input.identity, exit: 0, cause: "success", output: checked.output, sealed: true, judged: true });
  return { exit: 0, cause: "success", output: checked.output, ...(input.controls.continuation === undefined ? {} : { continuation: input.controls.continuation }) };
}

async function complete(input: RuntimeInput, config: WorkConfig, checked: PassedOutput): Promise<GatingResult> {
  const success = await runHook(input, config, "success");
  if (success?.status === "terminal") return finish(input, { ...success, judged: true, output: checked }, config);
  if (success?.status === "rejected") return finish(input, { exit: 1, cause: "rejected", reason: success.message.toString("utf8"), capture: success.capture, judged: true, output: checked }, config);
  return sealSuccess(input, config, checked);
}

async function refused(input: RuntimeInput, config?: WorkConfig, output?: PassedOutput): Promise<GatingResult> {
  const reason = input.controls.refusal?.reason ?? "The agent refused without a reason.";
  const record = await capture(input.writer, input.identity, "checks/refusal.txt", Buffer.from(reason));
  const capturePath = join(input.writer.runDirectory, ...record.split("/"));
  return finish(input, { exit: 1, cause: "refused", reason, capture: capturePath, judged: output !== undefined, ...(output === undefined ? {} : { output }) }, config);
}

async function faulted(input: RuntimeInput, config?: WorkConfig, output?: PassedOutput): Promise<GatingResult> {
  const reason = input.controls.fault?.reason ?? "The agent reported a fault without a reason.";
  const record = await capture(input.writer, input.identity, "checks/fault.txt", Buffer.from(reason));
  const capturePath = join(input.writer.runDirectory, ...record.split("/"));
  return finish(input, { exit: 2, cause: "fault", reason, capture: capturePath, judged: output !== undefined, ...(output === undefined ? {} : { output }) }, config);
}

function ended(input: RuntimeInput, message: Awaited<ReturnType<typeof prompt>>): ReturnType<typeof messageCause> {
  const local = input.signal?.fault?.();
  if (message === "signal" && local !== undefined && input.signal !== undefined && typeof input.signal.exit === "function" && input.signal.exit() === undefined) {
    return { exit: 2, cause: "fault", reason: faultReason(local.reason) };
  }
  return messageCause(message, signalExit(input));
}

async function reportedEnding(
  input: RuntimeInput, message: Awaited<ReturnType<typeof prompt>>, ending: Pick<Ending, "judged" | "output">, config: WorkConfig,
): Promise<GatingResult | undefined> {
  if (input.controls.fault !== undefined) return faulted(input, config, ending.output);
  const terminal = ended(input, message);
  return terminal === undefined ? undefined : finish(input, { ...terminal, ...ending }, config);
}

async function choose(input: RuntimeInput, config: Extract<RuntimeInput["config"], { mode: "choose" }>): Promise<GatingResult> {
  await setControlTools(input, ["refuse", "select", "fault"]);
  await startAttempt(input, config.received);
  const prepared = await preparedFirstTurn(input, config, false, config.received.map(({ name }) => name));
  let message = await prompt(input, prepared.firstTurn, input.budget);
  let sends = 0;
  for (;;) {
    if (input.controls.fault !== undefined) return faulted(input);
    const terminal = ended(input, message);
    if (terminal !== undefined) return finish(input, { ...terminal, judged: false });
    if (input.controls.refusal !== undefined) return refused(input);
    const selection = input.controls.selection;
    if (selection !== undefined) {
      await input.writer.append(choseEvent({ ts: input.clock.timestamp(), identity: input.identity, chose: selection.name, declined: config.alternatives.filter((name) => name !== selection.name), reason: selection.reason }));
      await endStage(input, { ts: input.clock.timestamp(), identity: input.identity, exit: 0, cause: "success" });
      return { exit: 0, cause: "success", selection };
    }
    const feedback = Buffer.from(`Select one of: ${config.alternatives.join(", ")}.\n`);
    const path = await recordCheck(input, "select", "select.txt", feedback, 1);
    if (sends >= config.retries) return finish(input, { exit: 1, cause: "exhausted", reason: feedback.toString("utf8"), capture: path, judged: false });
    sends += 1;
    await nextAttempt(input);
    message = await prompt(input, sendBackPrompt(feedback), input.budget);
  }
}

function workTools(config: WorkConfig, question = false): string[] {
  return [...((config.checklist?.length ?? 0) > 0 ? ["mark"] : []), "refuse", "clean-temp", "fault", ...(question ? ["continue"] : [])];
}

interface TempWarning { sent: boolean }

async function warnForTmp(input: RuntimeInput, state: TempWarning): Promise<Awaited<ReturnType<typeof prompt>> | undefined> {
  const tmp = input.harness.getTools().map(boundCleanTempPath).find((path) => path !== undefined);
  if (state.sent || tmp === undefined) return undefined;
  const entries = await Promise.all((await readdir(tmp)).map(async (name) => ({ name, size: (await lstat(join(tmp, name))).size })));
  if (entries.length === 0) return undefined;
  entries.sort((left, right) => right.size - left.size || bytewise(left.name, right.name));
  state.sent = true;
  const listing = entries.map(({ name, size }) => `- ${name} (${String(size)} bytes)`).join("\n");
  return prompt(input, [
    "The $TMP directory is destroyed when the work ends. It contains:", listing,
    "Move output-accounted evidence to $OUTPUT and material needed by later stages to $PWD.",
    "Use `clean-temp` to confirm its remaining contents are disposable, or finish anyway.",
  ].join("\n"), input.budget);
}

async function question(input: RuntimeInput, config: WorkConfig & { mode: "loop"; question: string }, checked: PassedOutput, sends: number, warning: TempWarning): Promise<GatingResult> {
  await setControlTools(input, workTools(config, true));
  let message = await prompt(input, questionPrompt(config.question), input.budget);
  for (;;) {
    if (input.controls.fault !== undefined) return faulted(input, config, checked);
    const terminal = ended(input, message);
    if (terminal !== undefined) return finish(input, { ...terminal, judged: true, output: checked }, config);
    if (input.controls.refusal !== undefined) return refused(input, config, checked);
    if (input.controls.continuation !== undefined) {
      const response = await warnForTmp(input, warning);
      if (response === undefined) return complete(input, config, checked);
      message = response;
      continue;
    }
    const feedback = Buffer.from("Answer the question with `continue`.\n");
    const path = await recordCheck(input, "question", "question.txt", feedback, 1);
    if (sends >= config.retries) return finish(input, { exit: 1, cause: "exhausted", reason: feedback.toString("utf8"), capture: path, judged: true, output: checked }, config);
    sends += 1;
    await nextAttempt(input);
    message = await prompt(input, sendBackPrompt(feedback), input.budget);
  }
}

interface PreparedFirstTurn { firstTurn: string }

async function preparedFirstTurn(
  input: RuntimeInput, config: CommonConfig, writesOutput: boolean, suppliedNames?: readonly string[],
): Promise<PreparedFirstTurn> {
  const names = [...(suppliedNames ?? (config.inputPath === undefined
    ? config.received.map(({ name }) => name)
    : await readdir(config.inputPath)))].sort(bytewise);
  const priorFailureInputs = names.filter((name) => config.priorFailureInputs?.includes(name) === true);
  const firstTurn = await retainPrompt(absoluteCapture(input, config.session), "first-turn.txt", buildInitialPrompt(names, writesOutput, priorFailureInputs));
  if (config.promptSources !== undefined) {
    const sources = resolvePromptSources(config.promptSources, config.received, names, config.session);
    await input.writer.append(promptEvent({ ts: input.clock.timestamp(), identity: input.identity, prompt: sources }));
  }
  return { firstTurn };
}

async function before(input: RuntimeInput, config: WorkConfig): Promise<GatingResult | undefined> {
  const result = await runHook(input, config, "before");
  if (result?.status === "terminal") return finish(input, { ...result, judged: false }, config);
  if (result?.status === "rejected") return finish(input, { exit: 1, cause: "rejected", reason: result.message.toString("utf8"), capture: result.capture, judged: false }, config);
  return undefined;
}

// The variable half of the prompt (ADR 0012): the input filenames as they stand
// AFTER `before`, so this is rendered here rather than with the system prompt —
// and retained here, on its way to the agent. Later rounds are the session's:
// a send-back and a loop's question are already turns in the file the record
// points at, and are not written down a second time.

async function firstWorkTurn(input: RuntimeInput, config: WorkConfig): Promise<GatingResult | PreparedFirstTurn> {
  const result = await before(input, config);
  if (result !== undefined) return result;
  return preparedFirstTurn(input, config, true, config.hooks?.before === undefined
    ? config.received.map(({ name }) => name)
    : undefined);
}

async function passedWork(
  input: RuntimeInput, config: WorkConfig & ({ mode: "stage" } | { mode: "loop"; question: string }), checked: PassedOutput, sends: number, warning: TempWarning,
): Promise<GatingResult> {
  return config.mode === "loop" ? question(input, config, checked, sends, warning) : complete(input, config, checked);
}

// The temp warning precedes the ladder, so the ladder judges the tree the
// warning response left behind and runs once on it. A warned turn is the one
// message that never triggers checks; every re-run after it is rejection-driven.
async function work(input: RuntimeInput, config: WorkConfig & ({ mode: "stage" } | { mode: "loop"; question: string })): Promise<GatingResult> {
  await setControlTools(input, workTools(config));
  await startAttempt(input, config.received);
  const opening = await firstWorkTurn(input, config);
  if (!("firstTurn" in opening)) return opening;
  let message = await prompt(input, opening.firstTurn, input.budget);
  let sends = 0;
  const warning = { sent: false };
  for (;;) {
    const terminal = await reportedEnding(input, message, { judged: false }, config);
    if (terminal !== undefined) return terminal;
    if (input.controls.refusal !== undefined) return refused(input, config);
    const warned = await warnForTmp(input, warning);
    if (warned !== undefined) {
      message = warned;
      continue;
    }
    const checks = await runChecks(input, config);
    if (checks.status === "terminal") return finish(input, checks, config);
    if (checks.status === "passed") return passedWork(input, config, checks.output, sends, warning);
    if (sends >= config.retries) return finish(input, { exit: 1, cause: "exhausted", reason: checks.terminalReason, capture: checks.capture, judged: checks.judged, ...(checks.output === undefined ? {} : { output: checks.output }) }, config);
    sends += 1;
    await nextAttempt(input);
    message = await prompt(input, checks.retryPrompt, input.budget);
  }
}

export async function runGating(input: GatingInput): Promise<GatingResult> {
  const checklist = "checklist" in input.config ? input.config.checklist ?? [] : [];
  input.controls.checklist.splice(0, input.controls.checklist.length, ...checklist.map((text) => ({ text, state: "todo" as const })));
  input.controls.alternatives = input.config.mode === "choose" ? [...input.config.alternatives] : [];
  delete input.controls.refusal;
  delete input.controls.fault;
  delete input.controls.continuation;
  delete input.controls.selection;
  // The detach in endStage is the ordering guarantee; this one is the
  // backstop for endings that never reach a terminal append (a throw).
  const detach = attachPiTap(input.harness, { writer: input.writer, identity: input.identity, now: () => input.clock.timestamp() });
  const runtime: RuntimeInput = { ...input, budget: { milliseconds: 0, expired: false }, detach };
  try {
    return runtime.config.mode === "choose" ? await choose(runtime, runtime.config) : await work(runtime, runtime.config);
  } finally {
    await detach();
  }
}
