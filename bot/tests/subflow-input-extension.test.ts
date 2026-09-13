import { fauxAssistantMessage, fauxToolCall, type ToolResultMessage } from "@earendil-works/pi-ai";
import { join } from "node:path";
import { rm, writeFile } from "node:fs/promises";
import { afterEach, expect, test } from "vitest";
import type { Flow } from "../src/model.ts";
import type { SubflowToolDetail } from "../src/tools.ts";
import { outputOf } from "./hostile.ts";
import { assembly, flow, roots, stage, start, type Script } from "./flow-harness.ts";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function flows(): { main: Flow; scope: Map<string, Flow> } {
  const broken = flow("broken", "subflows/broken", [stage("subflows/broken/01-answer.md", "answer")]);
  const healthy = flow("healthy", "subflows/healthy", [stage("subflows/healthy/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  return { main, scope: new Map([["broken", broken], ["healthy", healthy]]) };
}

function result(prompt: { messages: readonly { role: string }[] }): ToolResultMessage<SubflowToolDetail[]> {
  const held = prompt.messages.find((message) => message.role === "toolResult" && "toolName" in message && message.toolName === "subflow");
  if (held === undefined) throw new Error("The parent received no subflow result.");
  return held as ToolResultMessage<SubflowToolDetail[]>;
}

test("file-backed subflows reject suffixes that cannot name a retained request", async () => {
  const suffixes = ["bad\\suffix", "bad-name", "💥", "x".repeat(248)];
  const { main, scope } = flows();
  let received: ToolResultMessage<SubflowToolDetail[]> | undefined;
  const scripts = new Map<string, Script>([
    ["healthy:01-answer:1", (context) => [async () => {
      await writeFile(outputOf(context), "healthy answer");
      return fauxAssistantMessage("done");
    }]],
    ["main:01-parent:1", (context) => [
      async () => {
        await Promise.all(suffixes.map((suffix) => writeFile(join(context.env["TMP"] ?? "", `input.${suffix}`), "work")));
        return fauxAssistantMessage([fauxToolCall("subflow", { calls: [...suffixes.map((suffix) => (
          { flow: "broken", "input-file": `$TMP/input.${suffix}` }
        )), { flow: "healthy", input: "work" }] })], { stopReason: "toolUse" });
      },
      async (prompt) => {
        received = result(prompt);
        await Promise.all(suffixes.map((suffix) => rm(join(context.env["TMP"] ?? "", `input.${suffix}`))));
        await writeFile(outputOf(context), "parent continued");
        return fauxAssistantMessage("done");
      },
    ]],
  ]);
  const run = await start(main, assembly(main, scope), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  expect(received?.details).toHaveLength(suffixes.length + 1);
  for (const detail of received?.details?.slice(0, suffixes.length) ?? []) {
    expect(detail).toEqual(expect.objectContaining({ started: false, reason: expect.stringContaining("extension") as unknown }));
    expect(detail).not.toHaveProperty("child");
  }
  expect(received?.details?.at(-1)).toEqual(expect.objectContaining({ started: true, exit: 0, cause: "success" }));
});
