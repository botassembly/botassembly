import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, expect, test } from "vitest";
import { createMemoryHarness } from "../src/harness.ts";
import { runGating } from "../src/gating.ts";
import type { DriverClock, Executable } from "../src/process.ts";
import { runStartEvent } from "../src/record-events.ts";
import { createRecordWriter, hashBytes } from "../src/record.ts";
import { createControlContext, createControlTools } from "../src/tools.ts";

const roots: string[] = [];
const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function failedStage(failureSource: string, failureMode = 0o755) {
  const root = await mkdtemp(join(tmpdir(), "bot-failure-hook-ending-"));
  roots.push(root);
  const input = join(root, "input");
  const output = join(root, "output");
  const runs = join(root, "runs");
  await Promise.all([mkdir(input), mkdir(runs)]);
  const created = await createRecordWriter(runs, runStartEvent({
    ts: clock.timestamp(), run: "2026-08-22T14-50-00-cafe", assembly: "gating", assemblyHash: "a".repeat(64), flow: "main",
    request: { path: "request.txt", sha256: "b".repeat(64), bytes: 1, via: "stdin" },
  }));
  if (created.status !== "created") throw new Error("temporary record name collided");
  const faux = fauxProvider({ tokensPerSecond: 10_000 });
  faux.setResponses([async () => { await writeFile(output, "rejected work"); return fauxAssistantMessage("done"); }]);
  const models = createModels();
  models.setProvider(faux.provider);
  const controls = createControlContext();
  const harness = createMemoryHarness({
    models, model: faux.getModel(), systemPrompt: "Synthetic gating test.",
    tools: createControlTools(), context: controls,
  });
  const executable = async (file: string, source: string, mode = 0o755): Promise<Executable> => {
    const path = join(root, file);
    await writeFile(path, source);
    await chmod(path, mode);
    return { path, file: `flows/main/01-work/${file}`, sha256: hashBytes(source) };
  };
  const gate = await executable("gate.sh", "#!/bin/sh\nprintf 'gate rejected'\nexit 1\n");
  const failure = await executable("failure.sh", failureSource, failureMode);
  const result = await runGating({
    harness, controls, writer: created.writer, identity: { stage: "01-work", retry: 1 }, clock, close: () => harness.close(),
    config: {
      timeoutMs: 100, retries: 0, cwd: root,
      env: { ...process.env, INPUT: input, OUTPUT: output, TMP: root, PWD: root }, session: "stages/01-work/1/session.jsonl", received: [], options: [],
      mode: "stage", outputPath: output, outputExtension: "txt", gates: [gate], hooks: { failure },
    },
  });
  const record = (await readFile(created.writer.recordPath, "utf8")).trimEnd().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { record, result };
}

test("a timed-out failure hook preserves a failed gate ending", async () => {
  const { result, record } = await failedStage("#!/bin/sh\nsleep 2\n");

  expect(result).toMatchObject({ exit: 1, cause: "exhausted" });
  expect(record).toContainEqual(expect.objectContaining({ event: "check", check: "gate", exit: 1 }));
  expect(record).toContainEqual(expect.objectContaining({ event: "hook", hook: "failure", exit: null }));
  expect(record.find((event) => event["event"] === "stage_end"))
    .toMatchObject({ exit: 1, cause: "exhausted" });
});

test("an unexecutable failure hook preserves a failed gate ending", async () => {
  const { result, record } = await failedStage("#!/bin/sh\n", 0o644);

  expect(result).toMatchObject({ exit: 1, cause: "exhausted" });
  expect(record).toContainEqual(expect.objectContaining({ event: "hook", hook: "failure", exit: null }));
  expect(record.find((event) => event["event"] === "stage_end"))
    .toMatchObject({ exit: 1, cause: "exhausted" });
});
