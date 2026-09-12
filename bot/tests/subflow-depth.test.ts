import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { outputOf } from "./hostile.ts";
import { assembly, events, flow, roots, stage, start, type Script } from "./flow-harness.ts";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function callDepths(directory: string): Promise<unknown[]> {
  const calls = (await events(join(directory, "record.jsonl"))).filter((event) => event["event"] === "subflow_call");
  const depths: unknown[] = [];
  for (const call of calls) {
    depths.push(call["depth"]);
    if (typeof call["child"] === "string") depths.push(...await callDepths(join(directory, call["child"])));
  }
  return depths;
}

test("a cross-flow call chain records its positions and stops at the depth ceiling", async () => {
  const alpha = flow("alpha", "subflows/alpha", [stage("subflows/alpha/01-answer.md", "answer")]);
  const beta = flow("beta", "subflows/beta", [stage("subflows/beta/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  let forwards = 0;
  let toolAtCeiling: boolean | undefined;
  const chain: Script = (context) => {
    const canCall = context.tools.some((tool) => tool.name === "subflow");
    if (forwards === 9) {
      toolAtCeiling = canCall;
      return [async () => {
        await writeFile(outputOf(context), "leaf");
        return fauxAssistantMessage("done");
      }];
    }
    forwards += 1;
    const next = context.flow.name === "alpha" ? "beta" : "alpha";
    return [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: next, input: "continue" }] })], { stopReason: "toolUse" }),
      async () => {
        await writeFile(outputOf(context), "answer");
        return fauxAssistantMessage("done");
      },
    ];
  };
  const scripts = new Map<string, Script>([
    ["main:01-parent:1", (context) => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "alpha", input: "start" }] })], { stopReason: "toolUse" }),
      async () => {
        await writeFile(outputOf(context), "parent");
        return fauxAssistantMessage("done");
      },
    ]],
    ["alpha:01-answer:1", chain],
    ["beta:01-answer:1", chain],
  ]);

  const run = await start(main, assembly(main, new Map([["alpha", alpha], ["beta", beta]])), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });

  expect(await callDepths(run.writer.writer.runDirectory)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(toolAtCeiling).toBe(false);
});
