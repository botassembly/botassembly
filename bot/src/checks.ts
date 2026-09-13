// The three checks of gates.md, in the order that chapter states them —
// checklist, schema, gate — behind the output check that precedes all three,
// because a stage with no output has nothing for any of them to judge.
import { checkSchema } from "./schema-check.ts";
import type { PassedOutput } from "./record.ts";
import type { Cause } from "./spine.ts";
import { checklistFeedback, gateFailurePrompt, missingOutputFeedback, sendBackPrompt } from "./prompt.ts";
import { recordCheck, snapshotOutput, type RuntimeInput, type WorkConfig } from "./attempt.ts";
import { runGate } from "./executables.ts";
import { gateFeedback } from "./gate-feedback.ts";

export type ChecksResult =
  | { status: "passed"; output: PassedOutput }
  | { status: "failed"; retryPrompt: string; terminalReason: string; capture: string; judged: boolean; output?: PassedOutput }
  | { status: "terminal"; exit: number; cause: Cause; reason: string; capture?: string; judged: boolean };

async function checkChecklist(input: RuntimeInput, config: WorkConfig, output: PassedOutput): Promise<ChecksResult | undefined> {
  if ((config.checklist?.length ?? 0) === 0) return undefined;
  const todo = input.controls.checklist.map((item, index) => ({ item, number: index + 1 })).filter(({ item }) => item.state === "todo");
  const feedback = Buffer.from(checklistFeedback(todo.map(({ item, number }) => ({ number, text: item.text }))));
  const path = await recordCheck(input, "checklist", "checklist.txt", feedback, todo.length === 0 ? 0 : 1);
  return todo.length === 0 ? undefined : { status: "failed", retryPrompt: sendBackPrompt(feedback), terminalReason: feedback.toString("utf8"), capture: path, judged: true, output };
}

async function checkOutputSchema(input: RuntimeInput, config: WorkConfig, bytes: Buffer, output: PassedOutput): Promise<ChecksResult | undefined> {
  if (config.schema === undefined) return undefined;
  const result = await checkSchema(config.schema, bytes);
  const path = await recordCheck(input, "schema", "schema.txt", result.message, result.passed ? 0 : 1);
  return result.passed ? undefined : { status: "failed", retryPrompt: sendBackPrompt(result.message), terminalReason: result.message.toString("utf8"), capture: path, judged: true, output };
}

async function checkGates(input: RuntimeInput, config: WorkConfig, output: PassedOutput): Promise<ChecksResult | undefined> {
  for (const gate of config.gates ?? []) {
    const result = await runGate(input, config, gate);
    if (result.status === "rejected") {
      const feedback = gateFeedback(result.message);
      return { status: "failed", retryPrompt: gateFailurePrompt(feedback.model), terminalReason: feedback.terminal, capture: result.capture, judged: true, output };
    }
    // A gate the signal aborted judged nothing (runtime.md): the record must
    // claim no judgment it never received.
    if (result.status === "terminal") return { ...result, status: "terminal", judged: result.cause !== "signal" };
  }
  return undefined;
}

export async function runChecks(input: RuntimeInput, config: WorkConfig): Promise<ChecksResult> {
  const snapshot = await snapshotOutput(input, config);
  if (snapshot === undefined) {
    const feedback = Buffer.from(missingOutputFeedback());
    const path = await recordCheck(input, "output", "output-missing.txt", feedback, 1);
    return { status: "failed", retryPrompt: sendBackPrompt(feedback), terminalReason: feedback.toString("utf8"), capture: path, judged: false };
  }
  await recordCheck(input, "output", "output.txt", Buffer.alloc(0), 0);
  const checklist = await checkChecklist(input, config, snapshot.passed);
  if (checklist !== undefined) return checklist;
  const schema = await checkOutputSchema(input, config, snapshot.bytes, snapshot.passed);
  if (schema !== undefined) return schema;
  const gate = await checkGates(input, config, snapshot.passed);
  return gate ?? { status: "passed", output: snapshot.passed };
}
