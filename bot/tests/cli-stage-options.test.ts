// Ticket 0041: stage_start carries the stage's resolved option ladder — every
// stage's, with honest rungs — and run_start carries no options at all
// (record.md). These tests drive the REAL defaultGating (no createGating
// override), so the ladders come from the runtime's own resolution.
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

async function twoStageAssembly(home: string): Promise<void> {
  const base = join(home, "assemblies/review");
  await mkdir(join(base, "flows/main"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n  second: { provider: faux, model: faux-3, reasoning: medium }\n"),
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-first.md"), "---\n---\nDo the first step.\n"),
    writeFile(join(base, "flows/main/02-second.md"), "---\nintelligence: second\n---\nDo the second step.\n"),
  ]);
}

async function record(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

function ladder(events: Record<string, unknown>[], stage: string): { name: string; value: unknown; rung: string }[] {
  const start = events.find((event) => event["event"] === "stage_start" && event["stage"] === stage);
  expect(start).toBeDefined();
  const options = start?.["options"];
  expect(Array.isArray(options)).toBe(true);
  return Array.isArray(options) ? (options as { name: string; value: unknown; rung: string }[]) : [];
}

test("each stage_start carries its own resolved ladder and run_start carries none", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-stage-opts-"));
  roots.push(root);
  const home = join(root, "home");
  await twoStageAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "first answer" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("first done"),
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "second answer" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("second done"),
  ]);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("second answer");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));
  const start = events.find((event) => event["event"] === "run_start");
  expect(start).toBeDefined();
  expect(start).not.toHaveProperty("options");

  const first = ladder(events, "01-first");
  const second = ladder(events, "02-second");
  expect(first).toContainEqual({ name: "model", value: "faux-1", rung: "assembly" });
  expect(second).toContainEqual({ name: "model", value: "faux-3", rung: "stage" });
  expect(second).not.toEqual(first);
});
