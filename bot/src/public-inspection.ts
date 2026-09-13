// The package's read-only inspection door; runtime locks and pruning stay private.
export { inspectRuns, inspectStatus, type InspectionResult } from "./inspection.ts";

export function promptConstruction(event: Record<string, unknown>) {
  if (Object.hasOwn(event, "prompt")) return { available: true as const, sources: event["prompt"] };
  return { available: false, reason: "Prompt provenance was not recorded for this stage attempt." };
}
