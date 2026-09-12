import type { Execution, RunFlowInput } from "./execution.ts";

export function declaredSlots(input: RunFlowInput): Record<string, string> {
  const slots: Record<string, string> = {};
  for (const name of Object.keys(input.assembly.slots)) {
    const value = input.slots[name];
    if (value !== undefined) slots[name.toUpperCase()] = value;
  }
  return slots;
}

export const workdirRoot = (execution: Execution): string => execution.input.workdirRoot ?? execution.input.workdir;
