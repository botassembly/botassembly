import { fauxAssistantMessage, fauxToolCall, type ToolResultMessage } from "@earendil-works/pi-ai";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { hashBytes } from "../src/record.ts";
import type { SubflowToolDetail } from "../src/tools.ts";
import { bounded, outputOf } from "./hostile.ts";
import { assembly, events, flow, roots, stage, start, type Script } from "./flow-harness.ts";

const reads = vi.hoisted(() => ({ selected: new Map<string, number>() }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    readFile: async (...arguments_: Parameters<typeof original.readFile>) => {
      const source = arguments_[0];
      const path = typeof source === "string" ? source : Buffer.isBuffer(source) ? source.toString() : undefined;
      if (path !== undefined && reads.selected.has(path)) reads.selected.set(path, (reads.selected.get(path) ?? 0) + 1);
      return original.readFile(...arguments_);
    },
  };
});

beforeEach(() => { reads.selected.clear(); });

afterEach(async () => {
  reads.selected.clear();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function result(prompt: { messages: readonly { role: string }[] }): ToolResultMessage<SubflowToolDetail[]> {
  const held = prompt.messages.find((message) => message.role === "toolResult" && "toolName" in message && message.toolName === "subflow");
  if (held === undefined) throw new Error("The parent received no subflow result.");
  return held as ToolResultMessage<SubflowToolDetail[]>;
}

async function absent(path: string): Promise<void> {
  await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}

test("an unavailable file call touches no input or artifact while valid absolute-file siblings still run in order", async () => {
  const outside = await mkdtemp(join(tmpdir(), "bot-subflow-unavailable-input-"));
  roots.push(outside);
  const unavailablePath = join(outside, "unavailable.json");
  const validPath = join(outside, "valid.json");
  await Promise.all([
    writeFile(unavailablePath, '{"secret":true}'),
    writeFile(validPath, '{"question":"answer me"}'),
  ]);
  reads.selected.set(unavailablePath, 0);
  reads.selected.set(validPath, 0);

  const child = flow("child", "subflows/child", [stage("subflows/child/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  let received: ToolResultMessage<SubflowToolDetail[]> | undefined;
  let answers = "";
  let childRuns = 0;
  const scripts = new Map<string, Script>([
    ["child:01-answer:1", (context) => [async () => {
      childRuns += 1;
      await writeFile(outputOf(context), "child answer");
      return fauxAssistantMessage("done");
    }]],
    ["main:01-parent:1", (context) => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [
        { flow: "missing", "input-file": unavailablePath },
        { flow: "child", "input-file": validPath },
      ] })], { stopReason: "toolUse" }),
      async (prompt) => {
        received = result(prompt);
        answers = context.env["SUBFLOWS"] ?? "";
        await writeFile(outputOf(context), "parent continued");
        return fauxAssistantMessage("done");
      },
    ]],
  ]);
  const run = await start(main, assembly(main, new Map([["child", child]])), scripts);
  await expect(bounded(run.result, "unavailable file scope refusal")).resolves.toMatchObject({ exit: 0, cause: "success" });

  expect(reads.selected.get(unavailablePath)).toBe(0);
  expect(reads.selected.get(validPath)).toBe(1);
  expect(childRuns).toBe(1);
  expect(received?.details).toEqual([
    { call: 1, flow: "missing", depth: 1, started: false, reason: "Subflow missing is not in scope." },
    expect.objectContaining({ call: 2, flow: "child", depth: 1, started: true, exit: 0, cause: "success" }),
  ]);
  await absent(join(answers, "1"));
  await absent(join(run.writer.writer.runDirectory, "stages/01-parent/1/1/subflows/1"));
  await expect(readFile(join(answers, "2/input.json"), "utf8")).resolves.toBe('{"question":"answer me"}');
  await expect(readFile(join(run.writer.writer.runDirectory, "stages/01-parent/1/1/subflows/2/request.json"), "utf8"))
    .resolves.toBe('{"question":"answer me"}');
  const calls = (await events(run.writer.writer.recordPath)).filter((event) => event["event"] === "subflow_call");
  expect(calls.every((event) => typeof event["ts"] === "string")).toBe(true);
  expect(calls.map(({ ts: _ts, ...event }) => event)).toEqual([
    { event: "subflow_call", stage: "01-parent", retry: 1, call: 1, flow: "missing", depth: 1,
      started: false, reason: "Subflow missing is not in scope." },
    expect.objectContaining({ call: 2, flow: "child", started: true, input: {
      path: "stages/01-parent/1/1/subflows/2/request.json", sha256: hashBytes('{"question":"answer me"}'), bytes: 24,
    } }),
  ]);
});

test("unavailable nonexistent and inline calls keep the scope refusal without child artifacts", async () => {
  const child = flow("child", "subflows/child", [stage("subflows/child/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  const inline = "already present";
  let answers = "";
  const scripts = new Map<string, Script>([["main:01-parent:1", (context) => [
    fauxAssistantMessage([fauxToolCall("subflow", { calls: [
      { flow: "absent-file", "input-file": join(context.env["TMP"] ?? "", "does-not-exist.txt") },
      { flow: "absent-inline", input: inline },
    ] })], { stopReason: "toolUse" }),
    async () => {
      answers = context.env["SUBFLOWS"] ?? "";
      await writeFile(outputOf(context), "parent continued");
      return fauxAssistantMessage("done");
    },
  ]]]);
  const run = await start(main, assembly(main, new Map([["child", child]])), scripts);
  await expect(bounded(run.result, "unavailable input forms")).resolves.toMatchObject({ exit: 0, cause: "success" });

  const calls = (await events(run.writer.writer.recordPath)).filter((event) => event["event"] === "subflow_call");
  expect(calls.every((event) => typeof event["ts"] === "string")).toBe(true);
  expect(calls.map(({ ts: _ts, ...event }) => event)).toEqual([
    { event: "subflow_call", stage: "01-parent", retry: 1, call: 1, flow: "absent-file", depth: 1,
      started: false, reason: "Subflow absent-file is not in scope." },
    { event: "subflow_call", stage: "01-parent", retry: 1, call: 2, flow: "absent-inline", depth: 1,
      started: false, reason: "Subflow absent-inline is not in scope.",
      input: { text: inline, sha256: hashBytes(inline), bytes: Buffer.byteLength(inline) } },
  ]);
  for (const call of ["1", "2"]) {
    await absent(join(answers, call));
    await absent(join(run.writer.writer.runDirectory, `stages/01-parent/1/1/subflows/${call}`));
  }
});
