// The container executors: LOOP, PARALLEL and CHOOSE (graph.md). Each runs the
// stages beneath it through the runners its execution carries, so this file
// never imports the stage executor and the dependency edge stays one-way.
import type { Execution, FlowSource, NodeResult } from "./execution.ts";
import { bytewise, faultReason, stagePath, type Branch, type ChooseNode, type LoopNode, type ParallelNode } from "./model.ts";
import { runPool } from "./pool.ts";
import { loopDoneEvent, parallelDoneEvent, type ParallelBranch, type StageIdentity } from "./record-events.ts";

export function cancelled(execution: Execution): NodeResult | undefined {
  const exit = execution.input.signal.exitCode();
  if (exit !== undefined) return { exit, cause: "signal", outputs: [] };
  const local = execution.input.localStop?.failure();
  return local === undefined ? undefined : { exit: 2, cause: "fault", reason: faultReason(local.reason), outputs: [] };
}

function renamed(result: NodeResult, name: string): NodeResult {
  const output = result.outputs[0];
  return output === undefined ? result : { ...result, outputs: [{ ...output, name }] };
}

export async function runLoop(execution: Execution, node: LoopNode, sources: FlowSource[]): Promise<NodeResult> {
  let final: NodeResult | undefined;
  for (let repeat = 1; repeat <= node.repeat; repeat += 1) {
    const repeated = { ...execution, repeat, containers: [node, ...execution.containers] };
    const inputs = final === undefined ? sources : [...sources, ...final.outputs];
    final = await execution.sequence(repeated, node.sequence, inputs, node.question === undefined ? undefined : { kind: "loop", question: node.question });
    const terminal = await repeatOutcome(execution, node, final, repeat);
    if (terminal !== undefined) return terminal;
  }
  return limitOutcome(execution, node, final);
}

function loopIdentity(execution: Execution, node: LoopNode): StageIdentity {
  return { stage: stagePath(node, execution.input.flow), retry: 1 };
}

async function repeatOutcome(
  execution: Execution, node: LoopNode, result: NodeResult, repeat: number,
): Promise<NodeResult | undefined> {
  if (result.exit !== 0) {
    if (result.cause !== "signal" && result.cause !== "success") await execution.input.writer.append(loopDoneEvent({
      ts: execution.input.clock.timestamp(), identity: loopIdentity(execution, node),
      repeats: repeat, endedBy: result.cause,
      ...(result.reason === undefined ? {} : { reason: result.reason }),
    }));
    return result;
  }
  if (node.question === undefined || result.continuation?.answer !== "stop") return undefined;
  await execution.input.writer.append(loopDoneEvent({
    ts: execution.input.clock.timestamp(), identity: loopIdentity(execution, node),
    repeats: repeat, endedBy: "stop", reason: result.continuation.reason,
  }));
  return renamed(answered(result), node.name);
}

// The loop consumed its question's answer; a continuation left on the result
// would end the enclosing sequence and skip every node after the loop.
function answered(result: NodeResult): NodeResult {
  const { continuation: _consumed, ...rest } = result;
  return rest;
}

async function limitOutcome(
  execution: Execution, node: LoopNode, result: NodeResult | undefined,
): Promise<NodeResult> {
  if (result === undefined) return { exit: 2, cause: "fault", reason: "A loop ran no repeats.", outputs: [] };
  const reason = result.continuation?.reason;
  await execution.input.writer.append(loopDoneEvent({
    ts: execution.input.clock.timestamp(), identity: loopIdentity(execution, node),
    repeats: node.repeat, endedBy: "limit", ...(reason === undefined ? {} : { reason }),
  }));
  if (node.question === undefined) return renamed(answered(result), node.name);
  // The bound that ended the work is named first; the agent's words follow it.
  const limit = `The loop reached its repeat limit (${String(node.repeat)})`;
  return { exit: 1, cause: "rejected", reason: reason === undefined ? `${limit}.` : `${limit}: ${reason}`, outputs: result.outputs };
}

function branchOutput(result: NodeResult, branch: Branch): FlowSource[] {
  const output = result.outputs[0];
  return result.exit === 0 && output !== undefined ? [{ ...output, name: branch.name }] : [];
}

export async function runParallel(execution: Execution, node: ParallelNode, sources: FlowSource[]): Promise<NodeResult> {
  const branches = [...node.branches].sort((a, b) => bytewise(a.name, b.name));
  const nested = { ...execution, containers: [node, ...execution.containers] };
  const pool = await runPool({
    items: branches, width: node.width, cancelled: () => (execution.input.localStop?.abort ?? execution.input.signal.abort).aborted,
    run: async (branch) => {
      const value = await execution.sequence(nested, branch.sequence, sources);
      return { value, stop: value.exit !== 0 };
    },
  });
  const facts: ParallelBranch[] = branches.map((branch, index) => {
    const result = pool.values[index];
    if (pool.rejections?.some((rejection) => rejection.index === index)) return { branch: branch.name, started: true, exit: 2, cause: "fault" };
    return pool.started[index] && result !== undefined
      ? { branch: branch.name, started: true, exit: result.exit, cause: result.cause }
      : { branch: branch.name, started: false };
  });
  await execution.input.writer.append(parallelDoneEvent({
    ts: execution.input.clock.timestamp(), identity: {
      stage: stagePath(node, execution.input.flow),
      ...(execution.repeat === undefined ? {} : { repeat: execution.repeat }),
      retry: 1,
    },
    width: node.width, concurrent: pool.concurrent, branches: facts,
  }));
  const rejection = pool.rejections?.reduce((first, candidate) => candidate.index < first.index ? candidate : first);
  if (rejection !== undefined) throw rejection.error;
  const signal = cancelled(execution);
  if (signal !== undefined) return signal;
  const failed = pool.values.find((result) => result !== undefined && result.exit !== 0);
  if (failed !== undefined) return failed;
  return {
    exit: 0, cause: "success",
    outputs: branches.flatMap((branch, index) => {
      const result = pool.values[index];
      return result === undefined ? [] : branchOutput(result, branch);
    }),
  };
}

export async function runChoose(execution: Execution, node: ChooseNode, sources: FlowSource[]): Promise<NodeResult> {
  const choice = await execution.gatingNode(execution, node, {
    kind: "choose", alternatives: node.alternatives.map((branch) => branch.name),
    ...(node.question === undefined ? {} : { question: node.question }),
  }, sources);
  if (choice.exit !== 0) return choice;
  const branch = node.alternatives.find((candidate) => candidate.name === choice.selection?.name);
  if (branch === undefined) return { exit: 2, cause: "fault", reason: "The chooser returned no held alternative.", outputs: [] };
  const result = await execution.sequence({ ...execution, containers: [node, ...execution.containers] }, branch.sequence, sources);
  return renamed(result, branch.name);
}
