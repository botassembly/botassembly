import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { rm } from "node:fs/promises";
import { afterEach, expect, test } from "vitest";
import type { Branch, ChooseNode, LoopNode, ParallelNode } from "../src/model.ts";
import { assembly, events, flow, roots, stage, start, type Script } from "./flow-harness.ts";
import { latch } from "./terminal-test-helpers.ts";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function waitsForSignal(entered: ReturnType<typeof latch>, settled?: ReturnType<typeof latch>): Script {
  return (_context, signal) => [async () => {
    entered.resolve();
    if (!signal.abort.aborted) {
      await new Promise<void>((resolve) => { signal.abort.addEventListener("abort", () => { resolve(); }, { once: true }); });
    }
    settled?.resolve();
    return fauxAssistantMessage("late response after signal");
  }];
}

function branch(path: string, name: string): Branch {
  return { name, path, sequence: { path, nodes: [stage(`${path}.md`, name)] } };
}

function expectSignalEnding(record: Record<string, unknown>[]): void {
  expect(record.filter((event) => event["event"] === "signal")).toEqual([
    expect.objectContaining({ signal: 15, name: "SIGTERM" }),
  ]);
  expect(record.filter((event) => event["event"] === "run_end")).toEqual([
    expect.objectContaining({ exit: 143, cause: "signal" }),
  ]);
}

test("SIGTERM through LOOP ends the active repeat without a loop ending or later work", async () => {
  const entered = latch();
  const cycle: LoopNode = {
    kind: "LOOP", name: "cycle", path: "flows/main/01-cycle", options: {}, skills: [], repeat: 2,
    sequence: { path: "flows/main/01-cycle", nodes: [stage("flows/main/01-cycle/01-work.md", "work")] },
  };
  const main = flow("main", "flows/main", [cycle, stage("flows/main/02-tail.md", "tail")]);
  const scripts = new Map<string, Script>([
    ["main:01-cycle/01-work:1", waitsForSignal(entered)],
    ["main:01-cycle/01-work:2", () => [fauxAssistantMessage("second repeat must not start")]],
    ["main:02-tail:1", () => [fauxAssistantMessage("tail must not start")]],
  ]);
  const run = await start(main, assembly(main), scripts);
  await entered.promise;
  run.signal.activate("SIGTERM");

  await expect(run.result).resolves.toMatchObject({ exit: 143, cause: "signal" });
  const record = await events(run.writer.writer.recordPath);
  expectSignalEnding(record);
  expect(record.filter((event) => event["event"] === "stage_end" && event["stage"] === "01-cycle/01-work"))
    .toEqual([expect.objectContaining({ repeat: 1, exit: 143, cause: "signal" })]);
  expect(record.filter((event) => event["event"] === "loop_done")).toEqual([]);
  expect(record.filter((event) => event["event"] === "stage_start" &&
    (event["repeat"] === 2 || event["stage"] === "02-tail"))).toEqual([]);
});

test("SIGTERM through CHOOSE preserves the choice and starts no declined or later work", async () => {
  const entered = latch();
  const choose: ChooseNode = {
    kind: "CHOOSE", name: "pick", path: "flows/main/01-pick", options: {}, skills: [],
    alternatives: [branch("flows/main/01-pick/z", "z"), branch("flows/main/01-pick/a", "a")],
  };
  const main = flow("main", "flows/main", [choose, stage("flows/main/02-tail.md", "tail")]);
  const scripts = new Map<string, Script>([
    ["main:01-pick:1", () => [
      fauxAssistantMessage([fauxToolCall("select", { name: "a", reason: "chosen" })], { stopReason: "toolUse" }),
    ]],
    ["main:01-pick/a:1", waitsForSignal(entered)],
    ["main:01-pick/z:1", () => [fauxAssistantMessage("declined branch must not start")]],
    ["main:02-tail:1", () => [fauxAssistantMessage("tail must not start")]],
  ]);
  const run = await start(main, assembly(main), scripts);
  await entered.promise;
  run.signal.activate("SIGTERM");

  await expect(run.result).resolves.toMatchObject({ exit: 143, cause: "signal" });
  const record = await events(run.writer.writer.recordPath);
  expectSignalEnding(record);
  expect(record.filter((event) => event["event"] === "chose")).toEqual([
    expect.objectContaining({ chose: "a", reason: "chosen" }),
  ]);
  expect(record.filter((event) => event["event"] === "stage_end" && event["stage"] === "01-pick/a"))
    .toEqual([expect.objectContaining({ exit: 143, cause: "signal" })]);
  expect(record.filter((event) => event["event"] === "stage_start" &&
    (event["stage"] === "01-pick/z" || event["stage"] === "02-tail"))).toEqual([]);
});

test("SIGTERM through PARALLEL settles started branches and leaves queued work unstarted", async () => {
  const entered = { a: latch(), b: latch() };
  const settled = { a: latch(), b: latch() };
  const parallel: ParallelNode = {
    kind: "PARALLEL", name: "fan", path: "flows/main/01-fan", options: {}, skills: [], width: 2,
    branches: [
      branch("flows/main/01-fan/c", "c"), branch("flows/main/01-fan/b", "b"), branch("flows/main/01-fan/a", "a"),
    ],
  };
  const main = flow("main", "flows/main", [parallel, stage("flows/main/02-tail.md", "tail")]);
  const scripts = new Map<string, Script>([
    ["main:01-fan/a:1", waitsForSignal(entered.a, settled.a)],
    ["main:01-fan/b:1", waitsForSignal(entered.b, settled.b)],
    ["main:01-fan/c:1", () => [fauxAssistantMessage("queued branch must not start")]],
    ["main:02-tail:1", () => [fauxAssistantMessage("tail must not start")]],
  ]);
  const run = await start(main, assembly(main), scripts);
  await Promise.all([entered.a.promise, entered.b.promise]);
  run.signal.activate("SIGTERM");
  await Promise.all([settled.a.promise, settled.b.promise]);

  await expect(run.result).resolves.toMatchObject({ exit: 143, cause: "signal" });
  const record = await events(run.writer.writer.recordPath);
  expectSignalEnding(record);
  expect(record.filter((event) => event["event"] === "stage_end" &&
    (event["stage"] === "01-fan/a" || event["stage"] === "01-fan/b"))
    .map((event) => ({ stage: event["stage"], exit: event["exit"], cause: event["cause"] }))
    .sort((left, right) => String(left.stage).localeCompare(String(right.stage))))
    .toEqual([
      { stage: "01-fan/a", exit: 143, cause: "signal" },
      { stage: "01-fan/b", exit: 143, cause: "signal" },
    ]);
  expect(record.filter((event) => event["event"] === "parallel_done")).toEqual([
    expect.objectContaining({ branches: [
      { branch: "a", started: true, exit: 143, cause: "signal" },
      { branch: "b", started: true, exit: 143, cause: "signal" },
      { branch: "c", started: false },
    ] }),
  ]);
  expect(record.filter((event) => event["event"] === "stage_start" &&
    (event["stage"] === "01-fan/c" || event["stage"] === "02-tail"))).toEqual([]);
});
