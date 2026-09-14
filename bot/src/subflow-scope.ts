import type { Flow, StageNode } from "./model.ts";

/** The root flow occupies position zero. A run permits ten child calls after it. */
export const MAX_SUBFLOW_CALLS = 10;
export const MAX_DESCENT_DEPTH = MAX_SUBFLOW_CALLS + 1;

/** Resolve the flows visible to one agent or fan-out at an exact runtime state. */
export function scopedSubflows(
  assembly: ReadonlyMap<string, Flow>, flow: Flow, stage: StageNode | undefined,
  currentDepth: number, callChainDepth = 0,
): Map<string, Flow> {
  if (callChainDepth >= MAX_SUBFLOW_CALLS) return new Map();
  const scope = new Map(assembly);
  if (scope.get(flow.name) === flow) scope.delete(flow.name);
  for (const [name, child] of flow.subflows) scope.set(name, child);
  if (flow.maxDepth !== undefined && currentDepth < flow.maxDepth) scope.set(flow.name, flow);
  for (const [name, child] of stage?.subflows ?? []) scope.set(name, child);
  return scope;
}
