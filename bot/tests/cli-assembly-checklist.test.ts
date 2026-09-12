// Ticket 0035: the assembly agent has no checklist, schema, or gate
// (invocation.md) — a `## Checklist` heading in ASSEMBLY.md prose is prose.
// An ordinary stage with the same body keeps its extracted, enforced checklist.
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

// The same body lands in ASSEMBLY.md (assembly-agent prose) and in an
// ordinary stage document (an authored checklist).
const BODY = "Handle the request.\n\n## Checklist\n\n- [ ] Verify the input.\n";

function realBoundary(root: string, home: string, output: Buffer[], errors: Buffer[]) {
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
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

async function checklistAssembly(home: string): Promise<void> {
  const base = join(home, "assemblies/prose");
  await mkdir(join(base, "flows/main"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), `---\nintelligence: default\n---\n${BODY}`),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-work.md"), `---\n---\n${BODY}`),
  ]);
}

async function record(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

function checkKinds(events: Record<string, unknown>[]): unknown[] {
  return events.filter((event) => event["event"] === "check").map((event) => event["check"]);
}

test("the assembly agent has no checklist: `## Checklist` in ASSEMBLY.md prose is prose", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-assembly-checklist-"));
  roots.push(root);
  const home = join(root, "home");
  await checklistAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "routed" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);

  // Never marks an item: with no checklist in the gating config the run
  // completes; an enforced checklist would send the stage back and exhaust.
  await expect(main(["run", "start", "prose", "--retries", "0", "route this"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("routed");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));
  expect(checkKinds(events)).toEqual(["output"]);
  expect(events.filter((event) => event["event"] === "tool_call" && event["tool"] === "mark")).toEqual([]);
});

test("an ordinary stage with the same body still extracts and enforces its checklist", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-stage-checklist-"));
  roots.push(root);
  const home = join(root, "home");
  await checklistAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    fauxAssistantMessage([
      fauxToolCall("write", { path: "$OUTPUT", content: "worked" }),
      fauxToolCall("mark", { item: 1, state: "done", evidence: "Verified the input file." }),
    ], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);

  await expect(main(["run", "start", "prose/main", "--retries", "0", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("worked");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));
  expect(checkKinds(events)).toEqual(["output", "checklist"]);
  expect(events).toContainEqual(expect.objectContaining({ event: "tool_call", tool: "mark", decision: "done", item: 1, evidence: "Verified the input file." }));
});
