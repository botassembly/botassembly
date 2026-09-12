import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { rm } from "node:fs/promises";
import { afterEach, expect, test } from "vitest";
import type { Branch, ParallelNode } from "../src/model.ts";
import { heldRecord } from "../src/record-lines.ts";
import { createRunSignal } from "../src/signal.ts";
import { assembly, clock, events, flow, roots, stage, start, writes, type Script } from "./flow-harness.ts";
import { controlledGroups } from "./terminal-test-helpers.ts";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("output reading can replace a successful stage with an unnamed root machinery fault", async () => {
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const run = await start(main, assembly(main), new Map([["main:01-work:1", writes("done")]]), {
    readOutput: () => Promise.reject(new Error("sealed output became unreadable")),
  });
  await expect(run.result).resolves.toMatchObject({ exit: 2, cause: "fault", reason: "sealed output became unreadable" });
  expect((await events(run.writer.writer.recordPath)).at(-1)).toMatchObject({ event: "run_end", exit: 2, cause: "fault" });
  const held = await heldRecord(run.writer.writer.runDirectory);
  expect(held?.classification, held?.fault?.says).toBe("valid");
});

test("final cleanup can replace an ordinary failed stage with an unnamed machinery fault", async () => {
  const groups = controlledGroups([() => Promise.reject(new Error("cleanup after refusal failed"))]);
  const signal = createRunSignal(clock, undefined, groups);
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  const scripts = new Map<string, Script>([["main:01-work:1", () => [
    fauxAssistantMessage([fauxToolCall("refuse", { reason: "cannot proceed" })], { stopReason: "toolUse" }),
  ]]]);
  const run = await start(main, assembly(main), scripts, { signal });
  await expect(run.result).resolves.toMatchObject({
    exit: 2, cause: "fault", reason: expect.stringContaining("cleanup after refusal failed") as unknown,
  });
  const record = await events(run.writer.writer.recordPath);
  expect(record).toContainEqual(expect.objectContaining({ event: "stage_end", exit: 1, cause: "refused" }));
  expect(record.at(-1)).toMatchObject({ event: "run_end", exit: 2, cause: "fault" });
  expect(record.at(-1)).not.toHaveProperty("stage");
  const held = await heldRecord(run.writer.writer.runDirectory);
  expect(held?.classification, held?.fault?.says).toBe("valid");
});

function oneStageBranch(path: string, name: string): Branch {
  return { path, name, sequence: { path, nodes: [stage(`${path}.md`, name)] } };
}

test("final cleanup preserves a failed PARALLEL branch pre-stage identity", async () => {
  const groups = controlledGroups([() => Promise.reject(new Error("cleanup after branch fault failed"))]);
  const signal = createRunSignal(clock, undefined, groups);
  const parallel: ParallelNode = {
    kind: "PARALLEL", name: "fan", path: "flows/main/01-fan", options: {}, skills: [], width: 1,
    branches: [oneStageBranch("flows/main/01-fan/a", "a"), oneStageBranch("flows/main/01-fan/b", "b")],
  };
  const main = flow("main", "flows/main", [parallel]);
  const run = await start(main, assembly(main), new Map(), { signal });
  await expect(run.result).resolves.toMatchObject({ exit: 2, cause: "fault" });
  const record = await events(run.writer.writer.recordPath);
  expect(record).toContainEqual(expect.objectContaining({ event: "parallel_done", branches: [
    { branch: "a", started: true, exit: 2, cause: "fault" }, { branch: "b", started: false },
  ] }));
  expect(record.at(-1)).toMatchObject({ event: "run_end", stage: "01-fan/a", retry: 1, exit: 2, cause: "fault" });
  expect((await heldRecord(run.writer.writer.runDirectory))?.classification).toBe("valid");
});
