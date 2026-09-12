import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { outputOf } from "./hostile.ts";
import { assembly, events, flow, roots, stage, start, type Script } from "./flow-harness.ts";
import { temporaryHandle } from "../src/invocation.ts";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("a completed stage deletes only its own tmp before the next stage starts", async () => {
  const main = flow("main", "flows/main", [stage("flows/main/01-first.md", "first"), stage("flows/main/02-second.md", "second")]);
  let firstTmp = "";
  let firstInput = "";
  const scripts = new Map<string, Script>([
    ["main:01-first:1", (context) => [async () => {
      firstTmp = context.tmpPath;
      firstInput = context.inputPath;
      await Promise.all([writeFile(join(context.tmpPath, "build.log"), "temporary diagnostics\n"), writeFile(outputOf(context), "first\n")]);
      return fauxAssistantMessage("first finished");
    }, fauxAssistantMessage("finish anyway")]],
    ["main:02-second:1", (context) => [async () => {
      await expect(readdir(firstTmp)).rejects.toThrow();
      await writeFile(outputOf(context), "second\n");
      return fauxAssistantMessage("second finished");
    }]],
  ]);

  const run = await start(main, assembly(main), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  await expect(readFile(join(firstInput, "request.txt"), "utf8")).resolves.toBe("request bytes");
});

test("a flow-shared tmp survives its stages and is deleted when the flow ends", async () => {
  const ordinary = flow("main", "flows/main", [stage("flows/main/01-first.md", "first"), stage("flows/main/02-second.md", "second")]);
  const main = { ...ordinary, tmp: "flow" as const };
  let sharedTmp = "";
  const scripts = new Map<string, Script>([
    ["main:01-first:1", (context) => [async () => {
      sharedTmp = context.tmpPath;
      await Promise.all([writeFile(join(context.tmpPath, "handoff.txt"), "the working material\n"), writeFile(outputOf(context), "first\n")]);
      return fauxAssistantMessage("first finished");
    }, fauxAssistantMessage("finish anyway")]],
    ["main:02-second:1", (context) => [async () => {
      await expect(readFile(join(context.tmpPath, "handoff.txt"), "utf8")).resolves.toBe("the working material\n");
      await writeFile(outputOf(context), "second\n");
      return fauxAssistantMessage("second finished");
    }, fauxAssistantMessage("finish anyway")]],
  ]);

  const run = await start(main, assembly(main), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  await expect(readdir(sharedTmp)).rejects.toThrow();
});

test("settlement removes tmp after a refusal or signal", async () => {
  const outcomes = [
    { name: "refusal", expected: { exit: 1, cause: "refused" } },
    { name: "signal", expected: { exit: 143, cause: "signal" } },
  ] as const;

  for (const outcome of outcomes) {
    const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
    let tmp = "";
    const scripts = new Map<string, Script>([["main:01-work:1", (context, signal) => [async () => {
      tmp = context.tmpPath;
      await writeFile(join(tmp, "abandoned.log"), `${outcome.name} temporary evidence\n`);
      if (outcome.name === "refusal") return fauxAssistantMessage([fauxToolCall("refuse", { reason: "Cannot continue." })], { stopReason: "toolUse" });
      signal.activate("SIGTERM");
      return fauxAssistantMessage("interrupted");
    }]]]);

    const run = await start(main, assembly(main), scripts);
    await expect(run.result, outcome.name).resolves.toMatchObject(outcome.expected);
    await expect(readdir(tmp), outcome.name).rejects.toThrow();
  }
});

// Ticket 0144: a rejection in the temporary teardown after a settled stage
// used to discard the stage's returned result and end the whole run 2/fault
// with the rm error as reason. The failure is its own recorded diagnostic;
// the settled result stands, and stage_end and run_end agree.
test("a teardown failure after a settled stage is recorded without displacing the result", async () => {
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  let handle = "";
  const scripts = new Map<string, Script>([["main:01-work:1", (context) => [async () => {
    // Repoint the handle so the teardown's own verification rejects after
    // the stage settles — the deterministic stand-in for an orphaned
    // writer racing the delete.
    handle = temporaryHandle(context.tmpPath);
    await rm(handle, { force: true });
    await symlink(context.inputPath, handle, "dir");
    await writeFile(outputOf(context), "settled\n");
    return fauxAssistantMessage("done");
  }]]]);
  const run = await start(main, assembly(main), scripts);
  try {
    await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
    const record = await events(run.writer.writer.recordPath);
    expect(record.find((event) => event["event"] === "stage_end")).toMatchObject({ exit: 0, cause: "success" });
    expect(record.find((event) => event["event"] === "run_end")).toMatchObject({ exit: 0, cause: "success" });
    const teardown = record.find((event) => event["event"] === "tmp_teardown");
    expect(teardown).toMatchObject({ stage: "01-work" });
    expect(String(teardown?.["reason"])).toContain("temporary handle");
  } finally {
    if (handle !== "") await rm(handle, { force: true });
  }
});
