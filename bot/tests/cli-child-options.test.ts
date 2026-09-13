// Ticket 0027: a subflow child resolves its options from its own sentinels,
// the home, and the defaults (subflow.md) — never the parent invocation.
// These tests drive the REAL defaultGating (no createGating override).
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";

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

// The real defaultGating path: no createGating override, so option resolution,
// model selection, and the child record's rungs are the runtime's own.
function realBoundary(root: string, home: string, output: Buffer[], errors: Buffer[]) {
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }, { id: "faux-2" }, { id: "faux-3" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const held: CliBoundary = {
    cwd: root,
    env: { ...process.env, BOT_HOME: home, PWD: root, XDG_CACHE_HOME: join(root, "cache") },
    stdinIsTTY: true,
    stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { output.push(Buffer.from(bytes)); },
    stderr: (bytes) => { errors.push(Buffer.from(bytes)); },
    clock,
    models,
  };
  return { held, faux };
}

async function subflowAssembly(home: string): Promise<void> {
  const base = join(home, "assemblies/review");
  await Promise.all([
    mkdir(join(base, "flows/main"), { recursive: true }),
    mkdir(join(base, "subflows/helper"), { recursive: true }),
    mkdir(join(base, "subflows/plain"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n  command: { provider: faux, model: faux-2, reasoning: medium }\n  helper: { provider: faux, model: faux-3, reasoning: medium }\n"),
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-parent.md"), "---\n---\nCall the helper.\n"),
    writeFile(join(base, "subflows/helper/FLOW.md"), "---\ndescription: helper flow\nintelligence: helper\n---\n"),
    writeFile(join(base, "subflows/helper/01-answer.md"), "---\n---\nAnswer the question.\n"),
    writeFile(join(base, "subflows/plain/FLOW.md"), "---\ndescription: plain flow\n---\n"),
    writeFile(join(base, "subflows/plain/01-answer.md"), "---\n---\nAnswer plainly.\n"),
  ]);
}

async function record(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

function turnModels(events: Record<string, unknown>[]): string[] {
  return events.filter((event) => event["event"] === "turn").map((event) => String(event["model"]));
}

function expectOperations(events: Record<string, unknown>[], stage: string, provider: string, model: string): void {
  for (const eventName of ["provider_start", "turn"]) {
    const eventsForStage = events.filter((event) => event["event"] === eventName && event["stage"] === stage);
    expect(eventsForStage.length).toBeGreaterThan(0);
    expect(eventsForStage.every((event) => event["provider"] === provider && event["model"] === model)).toBe(true);
  }
}

// Ticket 0041: the ladder lives on stage_start — run_start carries no options.
function startRungs(events: Record<string, unknown>[]): { name: string; value: unknown; rung: string }[] {
  const start = events.find((event) => event["event"] === "stage_start");
  const options = start?.["options"];
  return Array.isArray(options) ? (options as { name: string; value: unknown; rung: string }[]) : [];
}

function expectBundle(rungs: { name: string; value: unknown; rung: string }[], intelligence: string, model: string, reasoning: string, rung: string): void {
  expect(rungs).toEqual(expect.arrayContaining([
    { name: "intelligence", value: intelligence, rung },
    { name: "provider", value: "faux", rung },
    { name: "model", value: model, rung },
    { name: "reasoning", value: reasoning, rung },
  ]));
}

test("a subflow child resolves its own FLOW.md options, not the parent invocation's", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-child-opts-"));
  roots.push(root);
  const home = join(root, "home");
  await subflowAssembly(home);
  await writeFile(join(root, "task.md"), "---\nintelligence: task\n---\nTask request.\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "helper", input: "hard question" }] })], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "child answer" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("child done"),
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "parent answer" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("parent done"),
  ]);

  await expect(main(["run", "start", "review/main", "--intelligence", "command", "@task.md"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("parent answer");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const parent = await record(join(home, "runs", run, "record.jsonl"));
  expect(turnModels(parent)).toEqual(["faux-2", "faux-2", "faux-2"]);
  expectBundle(startRungs(parent), "command", "faux-2", "medium", "command");
  expectOperations(parent, "01-parent", "faux", "faux-2");

  const child = await record(join(home, "runs", run, "stages/01-parent/1/1/subflows/1/record.jsonl"));
  expect(turnModels(child)).toEqual(["faux-3", "faux-3"]);
  const rungs = startRungs(child);
  expectBundle(rungs, "helper", "faux-3", "medium", "flow");
  expect(rungs.filter(({ rung }) => rung === "command" || rung === "task")).toEqual([]);
  expectOperations(child, "01-answer", "faux", "faux-3");
});

test("a subflow child with no options of its own falls through to the assembly, not the invocation", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-child-fallthrough-"));
  roots.push(root);
  const home = join(root, "home");
  await subflowAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "plain", input: "plain question" }] })], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "plain answer" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("child done"),
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "parent answer" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("parent done"),
  ]);

  await expect(main(["run", "start", "review/main", "--intelligence", "command", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const child = await record(join(home, "runs", run, "stages/01-parent/1/1/subflows/1/record.jsonl"));
  expect(turnModels(child)).toEqual(["faux-1", "faux-1"]);
  const rungs = startRungs(child);
  expectBundle(rungs, "default", "faux-1", "medium", "assembly");
  expect(rungs.filter(({ rung }) => rung === "command" || rung === "task")).toEqual([]);
  expectOperations(child, "01-answer", "faux", "faux-1");
});
