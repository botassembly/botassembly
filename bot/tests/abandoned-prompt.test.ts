// Ticket 0028 — abandoned-prompt edges. A prompt the guard abandoned can
// settle while the runtime is still writing the stage's ending: no event of
// the stage may follow its terminal stage_end (A4.1), and an abandonment the
// runtime never saw settle is recorded as unreconciled work with its window
// (A4.2). The held provider is the honest instrument here — a real
// abandonment needs a hung provider — so no live smoke exists for this path.
import { fauxAssistantMessage, type AssistantMessage } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createMemoryHarness } from "../src/harness.ts";
import { runGating, type GatingInput } from "../src/gating.ts";
import { runStartEvent } from "../src/record-events.ts";
import { createRecordWriter, type RecordWriter } from "../src/record.ts";
import { createControlContext, createControlTools } from "../src/tools.ts";
import { bounded, hostileModels, waitFor, type HostileStep } from "./hostile.ts";
import { manualClock } from "./manual-clock.ts";

const roots: string[] = [];
let runNumber = 0;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(script: HostileStep[]) {
  const clock = manualClock();
  const root = await mkdtemp(join(tmpdir(), "bot-abandoned-prompt-"));
  roots.push(root);
  const runs = join(root, "runs");
  const input = join(root, "input");
  const output = join(root, "output.txt");
  await Promise.all([mkdir(runs), mkdir(input)]);
  const created = await createRecordWriter(runs, runStartEvent({
    ts: clock.timestamp(),
    run: `2026-08-02T09-00-${String(runNumber++).padStart(2, "0")}-dead`,
    assembly: "abandoned",
    assemblyHash: "a".repeat(64),
    flow: "main",
    request: { path: "request.txt", sha256: "b".repeat(64), bytes: 1, via: "stdin" },
  }));
  if (created.status !== "created") throw new Error("temporary record name collided");
  const hostile = hostileModels(script);
  const controls = createControlContext();
  const harness = createMemoryHarness({
    models: hostile.models,
    model: hostile.model,
    systemPrompt: "Abandoned prompt sweep.",
    tools: createControlTools(),
    context: controls,
  });
  const common = {
    timeoutMs: 5_000, retries: 1, cwd: root,
    env: { ...process.env, INPUT: input, OUTPUT: output, TMP: root, PWD: root },
    session: "stages/01-work/1/session.jsonl", received: [], options: [],
  };
  return { root, output, clock, writer: created.writer, harness, controls, common };
}

async function events(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

/**
 * Run gating with a writer that settles the held prompt at the exact terminal
 * append and waits for the harness to finish delivering — the deterministic
 * form of "the abandoned prompt settled between abandonment and detach".
 */
function runAbandoned(f: Fixture, release?: () => void) {
  const writer: RecordWriter = {
    ...f.writer,
    async append(event) {
      await f.writer.append(event);
      if (event.event === "stage_end" && release !== undefined) {
        release();
        await f.harness.waitForIdle();
      }
    },
  };
  const input: GatingInput = {
    harness: f.harness, controls: f.controls, writer,
    identity: { stage: "01-work", retry: 1 }, clock: f.clock,
    config: { ...f.common, mode: "stage", outputPath: f.output, outputExtension: "txt" }, close: () => f.harness.close(),
  };
  return runGating(input);
}

test("no event of a stage follows its terminal stage_end when the abandoned prompt settles late", async () => {
  let release: (message: AssistantMessage) => void = () => undefined;
  const settle = new Promise<AssistantMessage>((resolve) => { release = resolve; });
  const f = await fixture([{ hostile: "held", settle }]);
  const running = runAbandoned(f, () => { release(fauxAssistantMessage("settled too late")); });
  await waitFor(() => f.clock.pending() > 0);
  f.clock.fire();
  const result = await bounded(running, "late-settling abandoned prompt");
  expect(result).toMatchObject({ exit: 1, cause: "timeout" });
  await f.writer.drain();
  const record = await events(f.writer.recordPath);
  const end = record.findIndex((event) => event["event"] === "stage_end");
  expect(end).toBeGreaterThanOrEqual(0);
  expect(record.slice(end + 1).filter((event) => event["stage"] === "01-work")).toEqual([]);
});

test("an abandoned prompt still unsettled at terminal time is recorded as unreconciled with its window", async () => {
  const f = await fixture([{ hostile: "held", settle: new Promise<AssistantMessage>(() => undefined) }]);
  const running = runAbandoned(f);
  await waitFor(() => f.clock.pending() > 0);
  f.clock.fire();
  const result = await bounded(running, "unreconciled abandoned prompt");
  expect(result).toMatchObject({ exit: 1, cause: "timeout" });
  const record = await events(f.writer.recordPath);
  const unreconciled = record.findIndex((event) => event["event"] === "unreconciled");
  const end = record.findIndex((event) => event["event"] === "stage_end");
  expect(end).toBeGreaterThanOrEqual(0);
  expect(unreconciled).toBeGreaterThanOrEqual(0);
  expect(unreconciled).toBeLessThan(end);
  const held = record[unreconciled];
  expect(held).toMatchObject({ stage: "01-work", retry: 1 });
  expect(typeof held?.["started"]).toBe("string");
  expect(typeof held?.["stopped"]).toBe("string");
  expect(String(held?.["started"]) < String(held?.["stopped"])).toBe(true);
});

test("a normal run appends no unreconciled event", async () => {
  let output = "";
  const f = await fixture([async () => { await writeFile(output, "done"); return fauxAssistantMessage("done"); }]);
  output = f.output;
  const result = await bounded(runAbandoned(f), "normal run");
  expect(result).toMatchObject({ exit: 0, cause: "success" });
  const record = await events(f.writer.recordPath);
  expect(record.filter((event) => event["event"] === "unreconciled")).toEqual([]);
});
