import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { afterEach, expect, test } from "vitest";
import { outputOf } from "./hostile.ts";
import { assembly, events, flow, roots, stage, start, type Script } from "./flow-harness.ts";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("a leftover tmp warns once, preserves its evidence, and clean-temp confirms disposal", async () => {
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  let warning = "";
  const scripts = new Map<string, Script>([["main:01-work:1", (context) => [
    async () => {
      await Promise.all([
        writeFile(`${context.tmpPath}/evidence.log`, "this is the larger saved measurement\n"),
        writeFile(`${context.tmpPath}/note.diff`, "tiny\n"),
        writeFile(outputOf(context), "finished\n"),
      ]);
      return fauxAssistantMessage("first finish");
    },
    async (provider) => {
      warning = JSON.stringify(provider.messages[provider.messages.length - 1]);
      await expect(readFile(`${context.tmpPath}/evidence.log`, "utf8")).resolves.toContain("measurement");
      return fauxAssistantMessage([fauxToolCall("clean-temp", {})], { stopReason: "toolUse" });
    },
    async () => {
      await expect(readdir(context.tmpPath)).resolves.toEqual([]);
      return fauxAssistantMessage("finish after confirming");
    },
  ]]]);

  const run = await start(main, assembly(main), scripts, { retries: new Map([["main:01-work:1", 0]]) });
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });

  // The warning's content is a decision aid, not a prose contract. These are
  // the facts an agent needs to save evidence rather than silently lose it.
  expect(warning).toContain("clean-temp");
  expect(warning).toContain("$OUTPUT");
  expect(warning).toContain("$PWD");
  expect(warning.indexOf("evidence.log")).toBeLessThan(warning.indexOf("note.diff"));
  const starts = (await events(run.writer.writer.recordPath)).filter((event) => event["event"] === "stage_start");
  expect(starts).toHaveLength(1);
});

test("an empty tmp completes without an extra warning round", async () => {
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  let warned = false;
  const scripts = new Map<string, Script>([["main:01-work:1", (context) => [
    async () => { await writeFile(outputOf(context), "finished\n"); return fauxAssistantMessage("finish"); },
    () => { warned = true; return fauxAssistantMessage("unexpected warning"); },
  ]]]);

  const run = await start(main, assembly(main), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  expect(warned).toBe(false);
});

test("a refusal with leftover tmp does not trigger the completion warning", async () => {
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  let warned = false;
  const scripts = new Map<string, Script>([["main:01-work:1", (context) => [
    async () => {
      await writeFile(`${context.tmpPath}/evidence.log`, "keep this\n");
      return fauxAssistantMessage([fauxToolCall("refuse", { reason: "Cannot continue." })], { stopReason: "toolUse" });
    },
    () => { warned = true; return fauxAssistantMessage("unexpected warning"); },
  ]]]);

  const run = await start(main, assembly(main), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 1, cause: "refused" });
  expect(warned).toBe(false);
});
