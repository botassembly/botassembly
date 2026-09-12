// Ticket 0154: hook execution is complete before prompt preparation begins.
// A hostile writer turns the old late append into a second fault, proving that
// the preparation fault remains the surfaced one only when the hook went first.
import { createModels, fauxProvider } from "@earendil-works/pi-ai";
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

test("a preparation fault survives a later hook append fault", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-hook-prompt-ordering-"));
  roots.push(root);
  const runs = join(root, "runs");
  const input = join(root, "input");
  const output = join(root, "output");
  await Promise.all([mkdir(runs), mkdir(input)]);
  const created = await createRecordWriter(runs, runStartEvent({
    ts: clock.timestamp(), run: "2026-08-27T12-00-00-cafe", assembly: "gating",
    assemblyHash: "a".repeat(64), flow: "main",
    request: { path: "request.txt", sha256: "b".repeat(64), bytes: 1, via: "stdin" },
  }));
  if (created.status !== "created") throw new Error("temporary record name collided");

  const source = "#!/bin/sh\nprintf 'before hook'\nexit 0\n";
  const hookPath = join(root, "before.sh");
  await writeFile(hookPath, source);
  await chmod(hookPath, 0o755);
  const before: Executable = {
    path: hookPath, file: "flows/main/01-work/before", sha256: hashBytes(source),
  };
  const faux = fauxProvider({ tokensPerSecond: 10_000 });
  const models = createModels();
  models.setProvider(faux.provider);
  const controls = createControlContext();
  const harness = createMemoryHarness({
    models, model: faux.getModel(),
    systemPrompt: "Synthetic gating test.", tools: createControlTools(), context: controls,
  });

  const original = created.writer;
  let preparationStarted = false;
  const writer = {
    ...original,
    append: async (event: Parameters<typeof original.append>[0]) => {
      if (event.event === "hook" && preparationStarted) throw new Error("later hook append fault");
      await original.append(event);
    },
  };
  const missing = join(root, "missing-prepared-input");
  const running = runGating({
    harness, controls, writer, identity: { stage: "01-work", retry: 1 }, clock, close: () => harness.close(),
    config: {
      timeoutMs: 500, retries: 0, cwd: root,
      env: { ...process.env, INPUT: input, OUTPUT: output, TMP: root, PWD: root },
      get inputPath() {
        preparationStarted = true;
        return missing;
      },
      session: "stages/01-work/1/session.jsonl", received: [], options: [],
      mode: "stage", outputPath: output, outputExtension: "txt", hooks: { before },
    },
  });

  await expect(running).rejects.toThrow(missing);
  const record = (await readFile(writer.recordPath, "utf8")).trimEnd().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(record).toContainEqual(expect.objectContaining({ event: "hook", hook: "before", exit: 0 }));
});
