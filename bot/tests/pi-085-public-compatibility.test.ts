import {
  AgentHarness,
  JSONL_STORAGE_VERSION,
  JsonlSessionRepo,
  MemorySessionRepo,
  StorageBackedSession,
  TODO_CONTEXT,
  type AgentHarnessTool,
  type Context,
  type HarnessEvent,
  type JsonlSessionMetadata,
} from "@earendil-works/pi-agent-core";
import { Type, createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { ModelRuntime, getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

test("the pinned Pi public harness and session surface works together", async () => {
  const context: Context = TODO_CONTEXT;
  const repo = new MemorySessionRepo();
  const session = await repo.create({ id: "compatibility" }, context);
  expect(StorageBackedSession).toBeTypeOf("function");
  expect(JsonlSessionRepo).toBeTypeOf("function");
  const metadata: JsonlSessionMetadata = {
    id: "compatibility", createdAt: 1, modifiedAt: 1, storageVersion: JSONL_STORAGE_VERSION,
    cwd: "/work", path: "/sessions/session.jsonl",
  };
  expect(metadata.storageVersion).toBe(JSONL_STORAGE_VERSION);

  const parameters = Type.Object({ value: Type.String() });
  const calls: string[] = [];
  const tool: AgentHarnessTool<{ owner: string }, typeof parameters, { echoed: string }> = {
    name: "probe", label: "Probe", description: "Exercise the public tool boundary.", parameters,
    execute(id, args, update, toolContext, invocation, toolExecutionContext) {
      calls.push(`${id}:${args.value}:${toolContext.owner}:${invocation.invocationId}:${String(toolExecutionContext === context)}`);
      update({ content: [{ type: "text", text: "partial" }], details: { echoed: args.value } });
      return Promise.resolve({ content: [{ type: "text", text: args.value }], details: { echoed: args.value }, terminate: true });
    },
  };
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage([fauxToolCall("probe", { value: "kept" })], { stopReason: "toolUse" })]);
  const models = createModels();
  models.setProvider(faux.provider);
  const created = await AgentHarness.create({
    session, models, model: faux.getModel(), systemPrompt: "Compatibility test.", tools: [tool], toolContext: { owner: "stage" },
    retry: { enabled: false, maxRetries: 0, baseDelayMs: 0 }, streamOptions: { maxRetries: 0 },
  }, context);
  const events: HarnessEvent["type"][] = [];
  created.harness.events.on("tool_end", (event) => { events.push(event.type); });
  const result = await (await created.harness.lane("main", context)).prompt("probe", undefined, context);
  expect(result.ok).toBe(true);
  expect(calls).toEqual([expect.stringContaining(":kept:stage:")]);
  expect(events).toEqual(["tool_end"]);
  expect(created.open).toEqual([]);
  await created.harness.close(context);
  await repo.close(context);
});

test("the pinned coding-agent package exposes the audited public model surface", () => {
  expect(ModelRuntime).toBeTypeOf("function");
  expect(getAgentDir).toBeTypeOf("function");
});

test("production imports the coding-agent package only through its public runtime boundary", () => {
  const source = join(import.meta.dirname, "../src");
  const imports = readdirSync(source, { recursive: true })
    .filter((path): path is string => typeof path === "string" && path.endsWith(".ts"))
    .filter((path) => readFileSync(join(source, path), "utf8").includes('from "@earendil-works/pi-coding-agent'));
  expect(imports).toEqual(["model-runtime.ts"]);
  expect(readFileSync(join(source, "model-runtime.ts"), "utf8")).not.toMatch(/@earendil-works\/pi-coding-agent\//u);
});
