import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import { events, realBoundary, runsIn, tempRoots, writes } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

type Option = { name: string; value: unknown; rung: string };

async function record(home: string, run: string, relative = "record.jsonl"): Promise<Record<string, unknown>[]> {
  return events(join(home, "runs", run, relative));
}

function stageStart(eventsHeld: Record<string, unknown>[], stage: string): Record<string, unknown> {
  const found = eventsHeld.find((event) => event["event"] === "stage_start" && event["stage"] === stage);
  expect(found).toBeDefined();
  return found ?? {};
}

function options(start: Record<string, unknown>): Option[] {
  const held = start["options"];
  expect(Array.isArray(held)).toBe(true);
  return Array.isArray(held) ? held as Option[] : [];
}

function option(start: Record<string, unknown>, name: string): Option | undefined {
  return options(start).find((held) => held.name === name);
}

function expectBundle(start: Record<string, unknown>, expected: { intelligence: string; provider?: string; model: string; reasoning: string; rung: string }): void {
  expect(option(start, "intelligence")).toEqual({ name: "intelligence", value: expected.intelligence, rung: expected.rung });
  expect(option(start, "model")).toEqual({ name: "model", value: expected.model, rung: expected.rung });
  expect(option(start, "reasoning")).toEqual({ name: "reasoning", value: expected.reasoning, rung: expected.rung });
  if (expected.provider === undefined) expect(options(start).some(({ name }) => name === "provider")).toBe(false);
  else expect(option(start, "provider")).toEqual({ name: "provider", value: expected.provider, rung: expected.rung });
}

function expectOperations(eventsHeld: Record<string, unknown>[], stage: string, provider: string, model: string): void {
  expect(eventsHeld).toContainEqual(expect.objectContaining({ event: "provider_start", stage, provider, model }));
  expect(eventsHeld).toContainEqual(expect.objectContaining({ event: "turn", stage, provider, model }));
}

function boundaryWithModels(root: string, home: string, provider: string, modelIds: string[]): { held: CliBoundary; faux: ReturnType<typeof fauxProvider> } {
  const output: Buffer[] = [], errors: Buffer[] = [];
  const base = realBoundary(root, home, output, errors);
  const faux = fauxProvider({ provider, models: modelIds.map((id) => ({ id, name: "Faux Model" })) });
  const models = createModels();
  models.setProvider(faux.provider);
  base.held.models = models;
  return { held: base.held, faux };
}

async function rootAssembly(home: string, intelligence: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), `intelligences:\n  ${intelligence}: { provider: faux, model: faux-1, reasoning: low }\n`),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), `---\nintelligence: ${intelligence}\n---\nReview.\n`),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nWork.\n"),
  ]);
}

test("separate root starts read the current complete intelligence bundle", async () => {
  const { root, home } = await roots.scratch("bot-model-starts-");
  await rootAssembly(home, "selected");
  const { held, faux } = boundaryWithModels(root, home, "faux", ["faux-1", "faux-2"]);
  faux.setResponses([writes("$OUTPUT", "old"), fauxAssistantMessage("done")]);
  await expect(main(["run", "start", "review/main", "request"], held)).resolves.toBe(0);
  const firstRun = (await runsIn(home))[0] ?? "";
  const first = await record(home, firstRun);
  const firstBytes = await readFile(join(home, "runs", firstRun, "record.jsonl"));
  expectBundle(stageStart(first, "01-work"), { intelligence: "selected", provider: "faux", model: "faux-1", reasoning: "low", rung: "assembly" });
  expectOperations(first, "01-work", "faux", "faux-1");

  await writeFile(join(home, "config.yaml"), "intelligences:\n  selected: { provider: faux, model: faux-2, reasoning: high }\n");
  faux.setResponses([writes("$OUTPUT", "new"), fauxAssistantMessage("done")]);
  await expect(main(["run", "start", "review/main", "request"], held)).resolves.toBe(0);
  const runNames = await runsIn(home);
  const secondRun = runNames.find((name) => name !== firstRun) ?? "";
  const second = await record(home, secondRun);
  expectBundle(stageStart(second, "01-work"), { intelligence: "selected", provider: "faux", model: "faux-2", reasoning: "high", rung: "assembly" });
  expectOperations(second, "01-work", "faux", "faux-2");
  expect(await readFile(join(home, "runs", firstRun, "record.jsonl"))).toEqual(firstBytes);
  expectOperations(first, "01-work", "faux", "faux-1");
});

async function resumeAssembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  selected: { provider: faux, model: faux-1, reasoning: low }\n  replacement: { provider: faux, model: faux-2, reasoning: high }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: selected\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-carried.md"), "---\n---\nCarry.\n"),
    writeFile(join(flow, "02-fresh.md"), "---\n---\nFresh.\n"),
  ]);
}

test("resume rejects an intelligence override and resolves fresh work from current configuration", async () => {
  const { root, home } = await roots.scratch("bot-model-resume-");
  await resumeAssembly(home);
  const { held, faux } = boundaryWithModels(root, home, "faux", ["faux-1", "faux-2"]);
  faux.setResponses([writes("$OUTPUT", "carried"), fauxAssistantMessage("done"), fauxAssistantMessage("done")]);
  await expect(main(["run", "start", "review/main", "request", "--retries", "0"], held)).resolves.toBe(1);
  const donor = (await runsIn(home))[0] ?? "";
  const donorBytes = await readFile(join(home, "runs", donor, "record.jsonl"));
  await writeFile(join(home, "config.yaml"), "intelligences:\n  selected: { provider: faux, model: faux-2, reasoning: high }\n  replacement: { provider: faux, model: faux-2, reasoning: high }\n");

  const refusedOut: Buffer[] = [], refusedErr: Buffer[] = [];
  const refused = boundaryWithModels(root, home, "faux", ["faux-1", "faux-2"]);
  refused.held.stdout = (bytes) => { refusedOut.push(Buffer.from(bytes)); };
  refused.held.stderr = (bytes) => { refusedErr.push(Buffer.from(bytes)); };
  refused.faux.setResponses([]);
  await expect(main(["run", "resume", donor, "--intelligence", "replacement", "-j"], refused.held)).resolves.toBe(2);
  expect(await runsIn(home)).toEqual([donor]);
  expect(Buffer.concat(refusedOut)).toEqual(Buffer.alloc(0));
  expect(Buffer.concat(refusedErr).toString()).toContain("Use only --home, --in, declared slots, and --id-file.");

  faux.setResponses([writes("$OUTPUT", "fresh"), fauxAssistantMessage("done")]);
  await expect(main(["run", "resume", donor], held)).resolves.toBe(0);
  const resumed = (await runsIn(home)).find((name) => name !== donor) ?? "";
  const resumedEvents = await record(home, resumed);
  expect(resumedEvents.filter((event) => event.event === "stage_carried").map((event) => event.stage)).toEqual(["01-carried"]);
  expect(resumedEvents.filter((event) => event.event === "stage_start").map((event) => event.stage)).toEqual(["02-fresh"]);
  expectBundle(stageStart(resumedEvents, "02-fresh"), { intelligence: "selected", provider: "faux", model: "faux-2", reasoning: "high", rung: "assembly" });
  expectOperations(resumedEvents, "02-fresh", "faux", "faux-2");
  expect(resumedEvents.filter((event) => event.event === "provider_start" || event.event === "turn").every((event) => event.stage !== "01-carried")).toBe(true);
  expect(await readFile(join(home, "runs", donor, "record.jsonl"))).toEqual(donorBytes);
});

test("the assembly entry agent records its complete assembly bundle and provider operation", async () => {
  const { root, home } = await roots.scratch("bot-model-assembly-entry-");
  await mkdir(join(home, "assemblies/review/flows/main"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  assembly: { provider: faux, model: faux-1, reasoning: max }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: assembly\n---\nRoute.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(home, "assemblies/review/flows/main/01-work.md"), "---\n---\nWork.\n"),
  ]);
  const { held, faux } = boundaryWithModels(root, home, "faux", ["faux-1"]);
  faux.setResponses([writes("$OUTPUT", "routed"), fauxAssistantMessage("done")]);
  await expect(main(["run", "start", "review", "route this"], held)).resolves.toBe(0);
  const run = (await runsIn(home))[0] ?? "";
  const heldEvents = await record(home, run);
  expectBundle(stageStart(heldEvents, "assembly"), { intelligence: "assembly", provider: "faux", model: "faux-1", reasoning: "max", rung: "assembly" });
  expectOperations(heldEvents, "assembly", "faux", "faux-1");
});

test("a providerless intelligence uses its unique available provider without recording an authored provider", async () => {
  const { root, home } = await roots.scratch("bot-model-providerless-");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  unique: { model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: unique\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nWork.\n"),
  ]);
  const { held, faux } = boundaryWithModels(root, home, "unique-provider", ["faux-1"]);
  faux.setResponses([writes("$OUTPUT", "unique"), fauxAssistantMessage("done")]);
  await expect(main(["run", "start", "review/main", "request"], held)).resolves.toBe(0);
  const run = (await runsIn(home))[0] ?? "";
  const heldEvents = await record(home, run);
  expectBundle(stageStart(heldEvents, "01-work"), { intelligence: "unique", model: "faux-1", reasoning: "medium", rung: "assembly" });
  expectOperations(heldEvents, "01-work", "unique-provider", "faux-1");
});
