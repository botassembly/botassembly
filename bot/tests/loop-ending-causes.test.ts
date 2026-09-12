import { expect, test } from "vitest";
import { runLoop } from "../src/containers.ts";
import type { Execution, NodeResult } from "../src/execution.ts";
import type { Cause } from "../src/spine.ts";
import { createRunSignal } from "../src/signal.ts";
import { clock, flow, stage } from "./flow-harness.ts";

const node = {
  kind: "LOOP" as const,
  name: "cycle",
  path: "flows/main/01-cycle",
  options: {},
  skills: [],
  repeat: 3,
  sequence: { path: "flows/main/01-cycle", nodes: [stage("flows/main/01-cycle/01-work.md", "work")] },
};

function executor(body: NodeResult, recorded: object[]): Execution {
  const main = flow("main", "flows/main", [node]);
  return {
    input: {
      flow: main,
      signal: createRunSignal(clock),
      clock,
      writer: { append: (event: object) => { recorded.push(event); return Promise.resolve(); } },
    },
    depth: 0,
    callChainDepth: 0,
    containers: [],
    sequence: () => Promise.resolve(body),
  } as unknown as Execution;
}

const failures: Cause[] = ["refused", "exhausted", "rejected", "blocked", "timeout", "fault"];

test.each(failures)("LOOP records a failed body cause as %s without changing its result", async (cause) => {
  const recorded: object[] = [];
  const body: NodeResult = { exit: cause === "fault" ? 2 : 1, cause, reason: `${cause} reason`, outputs: [] };
  const result = await runLoop(executor(body, recorded), node, []);
  expect(result).toEqual(body);
  expect(recorded).toEqual([expect.objectContaining({
    event: "loop_done", repeats: 1, ended_by: cause, reason: body.reason,
  })]);
});

test("LOOP preserves an outside signal result without writing loop_done", async () => {
  const recorded: object[] = [];
  const body: NodeResult = { exit: 143, cause: "signal", outputs: [] };
  const result = await runLoop(executor(body, recorded), node, []);
  expect(result).toEqual(body);
  expect(recorded).toEqual([]);
});
