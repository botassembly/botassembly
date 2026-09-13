import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { continuationFor } from "../src/continuation.ts";
import type { FanoutNode, Flow } from "../src/model.ts";
import { showLine } from "../src/readings.ts";
import { heldRecord } from "../src/record-lines.ts";
import { createRunSignal } from "../src/signal.ts";
import { outputOf } from "./hostile.ts";
import { assembly, clock, events, flow, roots, stage, start, type Script } from "./flow-harness.ts";
import { manualClock } from "./manual-clock.ts";
import { delegates } from "./terminal-test-helpers.ts";
import {
  expectFanoutStory, mutateChildRecord, mutateFanoutStory, recordMutations, storyMutations,
} from "./support/fanout-story.ts";

const outputRace = vi.hoisted<{ target: string; mode: "replace" | "append" }>(() => ({ target: "", mode: "replace" }));

vi.mock("../src/run-files.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/run-files.ts")>();
  const filesystem = await import("node:fs/promises");
  return {
    ...actual,
    holdRunFile: async (directory: string, path: string) => {
      const held = await actual.holdRunFile(directory, path);
      const target = join(directory, ...path.split("/"));
      if (target !== outputRace.target || !("copy" in held)) return held;
      outputRace.target = "";
      if (outputRace.mode === "replace") {
        await filesystem.rename(target, `${target}.replaced`);
        await filesystem.writeFile(target, "replacement");
      } else {
        await filesystem.appendFile(target, "-appended");
      }
      return held;
    },
  };
});

afterEach(async () => {
  outputRace.target = "";
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function fixture(maxItems = 4): { main: Flow; worker: Flow } {
  const worker = flow("worker", "subflows/worker", [stage("subflows/worker/01-answer.md", "answer")]);
  const fanout: FanoutNode = {
    kind: "FANOUT", name: "run", path: "flows/main/02-run",
    options: {}, skills: [], items: "jobs", subflow: "worker", width: 1, maxItems,
  };
  const main = flow("main", "flows/main", [
    { ...stage("flows/main/01-plan.md", "plan"), extension: "json" },
    fanout,
    stage("flows/main/03-finish.md", "finish"),
  ]);
  return { main, worker };
}

function latch(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((settled) => { resolve = settled; });
  return { promise, resolve };
}

function withWidth(base: Flow, width: number): Flow {
  const [before, fanout, after] = base.sequence.nodes;
  if (before === undefined || fanout?.kind !== "FANOUT" || after === undefined) {
    throw new Error("fixture lost its three-node FANOUT sequence");
  }
  return flow("main", "flows/main", [before, { ...fanout, width }, after]);
}

test("FANOUT runs sorted items through one child lifecycle and passes the complete output set", async () => {
  const { main, worker } = fixture();
  const started: string[] = [];
  const scripts = new Map<string, Script>([
    ["main:01-plan:1", (context) => [async () => {
      await writeFile(outputOf(context), JSON.stringify({ jobs: [
        { id: "zeta", input: { value: 2 } }, { id: "alpha", input: { value: 1 } },
      ] }));
      return fauxAssistantMessage("planned");
    }]],
    ["worker:01-answer:1", (context) => [async () => {
      const request = JSON.parse(await readFile(join(context.inputPath, "request.json"), "utf8")) as { id: string; input: { value: number } };
      started.push(request.id);
      await writeFile(outputOf(context), `${request.id}:${String(request.input.value)}`);
      return fauxAssistantMessage("answered");
    }]],
    ["main:03-finish:1", (context) => [async () => {
      expect(context.received.map(({ name }) => name)).toEqual(["alpha.txt", "zeta.txt"]);
      expect(await Promise.all(["alpha.txt", "zeta.txt"].map((name) => readFile(join(context.inputPath, name), "utf8"))))
        .toEqual(["alpha:1", "zeta:2"]);
      await writeFile(outputOf(context), "complete");
      return fauxAssistantMessage("finished");
    }]],
  ]);

  const run = await start(main, assembly(main, new Map([["worker", worker]])), scripts);
  const result = await run.result;
  expect(result.reason).toBeUndefined();
  expect(result).toMatchObject({ exit: 0, cause: "success" });
  expect(started).toEqual(["alpha", "zeta"]);
  const record = await events(run.writer.writer.recordPath);
  expect(record.filter(({ event }) => event === "fanout_start")).toHaveLength(1);
  expect(record.filter(({ event }) => event === "subflow_call").map(({ item }) => item)).toEqual(["alpha", "zeta"]);
  expect(record.filter(({ event }) => event === "fanout_done")).toEqual([
    expect.objectContaining({ exit: 0, cause: "success", concurrent: 1 }),
  ]);
  const startEvent = record.find(({ event }) => event === "fanout_start");
  const callEvent = record.find(({ event }) => event === "subflow_call");
  const doneEvent = record.find(({ event }) => event === "fanout_done");
  if (startEvent === undefined || callEvent === undefined || doneEvent === undefined) throw new Error("record lost FANOUT events");
  expect(showLine(startEvent)).toContain("2 planned items for worker, width 1");
  expect(showLine(callEvent)).toContain("call 1 for item alpha to worker");
  expect(showLine(doneEvent)).toContain("exit 0, success, peak concurrency 1");
  await expectFanoutStory(run, record);
  for (const mutation of storyMutations) {
    await expect(expectFanoutStory(run, mutateFanoutStory(record, mutation)), mutation).rejects.toBeDefined();
  }
});

test("FANOUT streams a large child output without rendering an agent answer or reading the child result into memory", async () => {
  const { main, worker } = fixture(1);
  const driver = manualClock();
  const large = Buffer.alloc(1024 * 1024 + 17, 0x61);
  const readNames: string[] = [];
  const scripts = new Map<string, Script>([
    ["main:01-plan:1", (context) => [async () => {
      await writeFile(outputOf(context), '{"jobs":[{"id":"only","input":{}}]}');
      return fauxAssistantMessage("planned");
    }]],
    ["worker:01-answer:1", (context) => [async () => {
      await writeFile(outputOf(context), large);
      return fauxAssistantMessage("answered");
    }]],
    ["main:03-finish:1", (context) => [async () => {
      expect(await readFile(join(context.inputPath, "only.txt"))).toEqual(large);
      await writeFile(outputOf(context), "complete");
      return fauxAssistantMessage("finished");
    }]],
  ]);
  const run = await start(main, assembly(main, new Map([["worker", worker]])), scripts, {
    clock: driver,
    timeouts: new Map([["main:03-finish:1", 10_000]]),
    readOutput: async (source) => {
      readNames.push(source.name);
      return readFile(source.diskPath);
    },
  });
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  expect(readNames).toEqual(["finish"]);
  const scratchEntries = await readdir(join(run.root, "scratch"), { recursive: true });
  expect(scratchEntries.some((entry) => entry.endsWith("answers/1/output.txt"))).toBe(false);
});

test.each(["replace", "append"] as const)(
  "FANOUT copies the held child snapshot when the output path is %s after opening",
  async (mode) => {
    const { main, worker } = fixture(1);
    const scripts = new Map<string, Script>([
      ["main:01-plan:1", (context) => [async () => {
        await writeFile(outputOf(context), '{"jobs":[{"id":"only","input":{}}]}');
        return fauxAssistantMessage("planned");
      }]],
      ["worker:01-answer:1", (context) => [async () => {
        await writeFile(outputOf(context), "original");
        outputRace.target = outputOf(context);
        outputRace.mode = mode;
        return fauxAssistantMessage("answered");
      }]],
      ["main:03-finish:1", (context) => [async () => {
        expect(await readFile(join(context.inputPath, "only.txt"), "utf8")).toBe("original");
        await writeFile(outputOf(context), "complete");
        return fauxAssistantMessage("finished");
      }]],
    ]);
    const run = await start(main, assembly(main, new Map([["worker", worker]])), scripts);
    await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  },
);

const malformed: [string, Buffer | string][] = [
  ["invalid UTF-8", Buffer.from([0xff])],
  ["invalid JSON", "{"],
  ["missing list", "{}"],
  ["empty list", '{"jobs":[]}'],
  ["non-list value", '{"jobs":{}}'],
  ["flat item", '{"jobs":["work"]}'],
  ["bad id", '{"jobs":[{"id":"Bad","input":{}}]}'],
  ["duplicate id", '{"jobs":[{"id":"same","input":{}},{"id":"same","input":{}}]}'],
  ["too many items", '{"jobs":[{"id":"a","input":{}},{"id":"b","input":{}}]}'],
  ["document above one MiB", `{"jobs":[{"id":"a","input":{"padding":"${"x".repeat(1024 * 1024)}"}}]}`],
];

test.each(malformed)("FANOUT rejects %s before publishing a plan or starting a child", async (_name, contents) => {
  const { main, worker } = fixture(1);
  let childStarted = false;
  const scripts = new Map<string, Script>([
    ["main:01-plan:1", (context) => [async () => {
      await writeFile(outputOf(context), contents);
      return fauxAssistantMessage("planned");
    }]],
    ["worker:01-answer:1", (context) => [async () => {
      childStarted = true;
      await writeFile(outputOf(context), "unexpected");
      return fauxAssistantMessage("answered");
    }]],
  ]);
  const run = await start(main, assembly(main, new Map([["worker", worker]])), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 1, cause: "rejected" });
  expect(childStarted).toBe(false);
  const record = await events(run.writer.writer.recordPath);
  expect(record.some(({ event }) => event === "fanout_start")).toBe(false);
  expect(record.some(({ event }) => event === "subflow_call")).toBe(false);
});

test("FANOUT waits for every item and selects machinery by sorted id rather than completion order", async () => {
  const { main: base, worker } = fixture();
  const main = withWidth(base, 3);
  const otherChildrenDone = latch();
  let remaining = 2;
  const scripts = new Map<string, Script>([
    ["main:01-plan:1", (context) => [async () => {
      await writeFile(outputOf(context), JSON.stringify({ jobs: [
        { id: "gamma", input: {} }, { id: "alpha", input: {} }, { id: "beta", input: {} },
      ] }));
      return fauxAssistantMessage("planned");
    }]],
    ["worker:01-answer:1", (context) => [async () => {
      const request = JSON.parse(await readFile(join(context.inputPath, "request.json"), "utf8")) as { id: string };
      if (request.id === "alpha") {
        await otherChildrenDone.promise;
        await rm(context.writer.recordPath);
        await mkdir(context.writer.recordPath);
      } else if (request.id === "gamma") {
        await writeFile(outputOf(context), "healthy");
      }
      if (request.id !== "alpha" && --remaining === 0) otherChildrenDone.resolve();
      return fauxAssistantMessage("settled");
    }]],
  ]);
  const run = await start(main, assembly(main, new Map([["worker", worker]])), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 2, cause: "fault" });
  const record = await events(run.writer.writer.recordPath);
  const rows = record.filter(({ event }) => event === "subflow_call");
  expect(rows.map(({ item }) => item)).toEqual(["alpha", "beta", "gamma"]);
  expect(rows.every(({ started }) => started === true)).toBe(true);
  expect(record.find(({ event }) => event === "fanout_done")).toMatchObject({ exit: 2, cause: "fault", selected: "alpha" });
  expect(record.some(({ event, stage }) => event === "stage_start" && stage === "03-finish")).toBe(false);
});

test("SIGTERM stops new FANOUT launches and settles every planned item without a partial handoff", async () => {
  const { main: base, worker } = fixture();
  const main = withWidth(base, 2);
  const twoStarted = latch();
  let starts = 0;
  const signal = createRunSignal(clock);
  const scripts = new Map<string, Script>([
    ["main:01-plan:1", (context) => [async () => {
      await writeFile(outputOf(context), JSON.stringify({ jobs: [
        { id: "a", input: {} }, { id: "b", input: {} }, { id: "c", input: {} },
      ] }));
      return fauxAssistantMessage("planned");
    }]],
    ["worker:01-answer:1", (context, runSignal) => [async () => {
      starts += 1;
      if (starts === 2) twoStarted.resolve();
      await new Promise<void>((resolve) => {
        if (runSignal.abort.aborted) resolve();
        else runSignal.abort.addEventListener("abort", () => { resolve(); }, { once: true });
      });
      await writeFile(outputOf(context), "too late");
      return fauxAssistantMessage("stopped");
    }]],
  ]);
  const run = await start(main, assembly(main, new Map([["worker", worker]])), scripts, { signal });
  await twoStarted.promise;
  signal.activate("SIGTERM");
  await expect(run.result).resolves.toMatchObject({ exit: 143, cause: "signal" });
  const record = await events(run.writer.writer.recordPath);
  const rows = record.filter(({ event }) => event === "subflow_call");
  expect(rows).toEqual([
    expect.objectContaining({ item: "a", started: true, exit: 143, cause: "signal" }),
    expect.objectContaining({ item: "b", started: true, exit: 143, cause: "signal" }),
    expect.objectContaining({ item: "c", started: false }),
  ]);
  expect(record.find(({ event }) => event === "fanout_done")).toMatchObject({ exit: 143, cause: "signal" });
  expect(record.some(({ event, stage }) => event === "stage_start" && stage === "03-finish")).toBe(false);
  const continuation = await continuationFor({
    name: basename(run.writer.writer.runDirectory), directory: run.writer.writer.runDirectory, assembly: "flow-test",
    assemblyHash: "a".repeat(64), flow: "main",
    request: { bytes: Buffer.from("request bytes"), extension: "txt", via: "stdin" }, events: record,
  }, main);
  if ("code" in continuation) throw new Error("the FANOUT donor was refused");
  expect(continuation.skip).toBe(1);
  expect(continuation.sources.map(({ name }) => name)).toEqual(["plan"]);
});

test.each(["fanout_start", "subflow_call", "fanout_done"])(
  "a writer failure at %s leaves no successor or invented completion",
  async (failedEvent) => {
    const { main, worker } = fixture(1);
    let childStarted = false;
    const scripts = new Map<string, Script>([
      ["main:01-plan:1", (context) => [async () => {
        await writeFile(outputOf(context), '{"jobs":[{"id":"only","input":{}}]}');
        return fauxAssistantMessage("planned");
      }]],
      ["worker:01-answer:1", (context) => [async () => {
        childStarted = true;
        await writeFile(outputOf(context), "answer");
        return fauxAssistantMessage("answered");
      }]],
    ]);
    let heldPath = "";
    const run = await start(main, assembly(main, new Map([["worker", worker]])), scripts, {
      wrapWriter: (writer) => delegates(writer, async (event) => {
        if (event.event === failedEvent) {
          heldPath = `${writer.recordPath}.held`;
          await rename(writer.recordPath, heldPath);
          await mkdir(writer.recordPath);
        }
        await writer.append(event);
      }),
    });
    await expect(run.result).resolves.toMatchObject({ exit: 2, cause: "fault" });
    expect(childStarted).toBe(failedEvent !== "fanout_start");
    await rm(run.writer.writer.recordPath, { recursive: true });
    await rename(heldPath, run.writer.writer.recordPath);
    const record = await events(run.writer.writer.recordPath);
    expect(record.some(({ event, stage }) => event === "stage_start" && stage === "03-finish")).toBe(false);
    expect(record.some(({ event }) => event === "fanout_done")).toBe(false);
    expect(record.some(({ event }) => event === "run_end")).toBe(false);
    await expect(heldRecord(run.writer.writer.runDirectory)).resolves.toMatchObject({ classification: "incomplete" });
    if (failedEvent !== "fanout_start") {
      await expect(heldRecord(join(run.writer.writer.runDirectory, "stages/02-run/1/1/subflows/1")))
        .resolves.toMatchObject({ classification: "valid" });
    }
  },
);

test.each(["changed", "removed"])("FANOUT faults when a sealed child output is %s before handoff", async (mutation) => {
  const { main, worker } = fixture(1);
  const scripts = new Map<string, Script>([
    ["main:01-plan:1", (context) => [async () => {
      await writeFile(outputOf(context), '{"jobs":[{"id":"only","input":{}}]}');
      return fauxAssistantMessage("planned");
    }]],
    ["worker:01-answer:1", (context) => {
      const append = context.writer.append.bind(context.writer);
      let sealedPath: string | undefined;
      context.writer.append = async (event) => {
        await append(event);
        if (event.event === "stage_end" && typeof event.output?.path === "string") sealedPath = event.output.path;
        if (event.event === "run_end") {
          if (sealedPath === undefined) throw new Error("child stage did not seal an output");
          const retained = join(context.writer.runDirectory, ...sealedPath.split("/"));
          if (mutation === "changed") await writeFile(retained, "changed after sealing");
          else await rm(retained);
        }
      };
      return [async () => {
        await writeFile(outputOf(context), "sealed answer");
        return fauxAssistantMessage("answered");
      }];
    }],
  ]);
  const run = await start(main, assembly(main, new Map([["worker", worker]])), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 2, cause: "fault" });
  const record = await events(run.writer.writer.recordPath);
  expect(record.find(({ event }) => event === "fanout_done")).toMatchObject({ exit: 2, cause: "fault", selected: "only" });
  expect(record.some(({ event, stage }) => event === "stage_start" && stage === "03-finish")).toBe(false);
});

test.each(recordMutations)("FANOUT rejects a child whose final output has a mutated %s", async (mutation) => {
  const { main, worker } = fixture(1);
  const scripts = new Map<string, Script>([
    ["main:01-plan:1", (context) => [async () => {
      await writeFile(outputOf(context), '{"jobs":[{"id":"only","input":{}}]}');
      return fauxAssistantMessage("planned");
    }]],
    ["worker:01-answer:1", (context) => {
      const append = context.writer.append.bind(context.writer);
      context.writer.append = async (event) => {
        await append(event);
        if (event.event !== "run_end") return;
        await mutateChildRecord(context.writer.recordPath, mutation);
      };
      return [async () => {
        await writeFile(outputOf(context), "answer");
        return fauxAssistantMessage("answered");
      }];
    }],
  ]);
  const run = await start(main, assembly(main, new Map([["worker", worker]])), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 2, cause: "fault" });
  const record = await events(run.writer.writer.recordPath);
  expect(record.find(({ event }) => event === "fanout_done")).toMatchObject({ exit: 2, selected: "only" });
  expect(record.some(({ event, stage }) => event === "stage_start" && stage === "03-finish")).toBe(false);
});
