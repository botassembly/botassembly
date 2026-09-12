import { afterEach, expect, test } from "vitest";
import { runParallel } from "../src/containers.ts";
import type { Execution, RunFlowInput } from "../src/execution.ts";
import type { Branch, Flow, ParallelNode } from "../src/model.ts";
import type { RecordWriter } from "../src/record.ts";
import { latch } from "./terminal-test-helpers.ts";

const controllers: AbortController[] = [];
afterEach(() => { controllers.splice(0).forEach((controller) => { controller.abort(); }); });

function branch(name: string): Branch {
  const path = `flows/main/01-fan/${name}`;
  return { name, path, sequence: { path, nodes: [] } };
}

async function scenario(releaseOrder: readonly ["a" | "z", "a" | "z"]): Promise<{
  reason: string; settlements: string[]; events: Record<string, unknown>[];
}> {
  const releases = { a: latch(), z: latch() };
  const settled = { a: latch(), z: latch() };
  const bothStarted = latch();
  const settlements: string[] = [];
  const events: Record<string, unknown>[] = [];
  const started = new Set<string>();
  const controller = new AbortController();
  controllers.push(controller);
  const node: ParallelNode = {
    kind: "PARALLEL", name: "fan", path: "flows/main/01-fan", options: {}, skills: [], width: 2,
    branches: [branch("z"), branch("a")],
  };
  const flow: Flow = {
    name: "main", path: "flows/main", options: {}, skills: [], subflows: new Map(),
    sequence: { path: "flows/main", nodes: [node] },
  };
  const writer = {
    append: (event: Record<string, unknown>) => { events.push(event); return Promise.resolve(); },
  } as unknown as RecordWriter;
  const input = {
    flow, writer, clock: { timestamp: () => "2026-09-05T14:00:00.000Z" },
    signal: { abort: controller.signal, exitCode: () => undefined },
  } as unknown as RunFlowInput;
  const execution: Execution = {
    input, depth: 0, callChainDepth: 0, containers: [],
    sequence: async (_execution, sequence) => {
      const name = sequence.path.endsWith("/a") ? "a" : "z";
      started.add(name);
      if (started.size === 2) bothStarted.resolve();
      await releases[name].promise;
      settlements.push(name);
      settled[name].resolve();
      throw new Error(`${name} machinery failed`);
    },
    gatingNode: () => Promise.reject(new Error("not used")),
  };
  const result = runParallel(execution, node, []);
  await bothStarted.promise;
  releases[releaseOrder[0]].resolve();
  await settled[releaseOrder[0]].promise;
  releases[releaseOrder[1]].resolve();
  await settled[releaseOrder[1]].promise;
  const reason = await result.then(() => "resolved", (error: unknown) => error instanceof Error ? error.message : String(error));
  return { reason, settlements, events };
}

test("parallel machinery failures choose bytewise branch order after every started worker settles", async () => {
  for (const order of [["z", "a"], ["a", "z"]] as const) {
    const held = await scenario(order);
    expect(held.settlements).toEqual(order);
    expect(held.reason).toBe("a machinery failed");
    expect(held.events).toEqual([expect.objectContaining({
      event: "parallel_done",
      branches: [
        { branch: "a", started: true, exit: 2, cause: "fault" },
        { branch: "z", started: true, exit: 2, cause: "fault" },
      ],
    })]);
  }
});
