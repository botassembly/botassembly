// Ticket 0123: an intelligence is the new, flat name for one complete model
// bundle. These probes use bot check for every authorable rung and a real run
// for the two properties check cannot observe: validation precedes run_start,
// and a started run keeps the home table it read.
import { semanticCheck } from "./semantic-check.ts";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall, type Context } from "@earendil-works/pi-ai";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import { boundaryFor, cleanup, scratch, text, type Capture } from "./assembly-home.ts";

afterEach(cleanup);

const TABLE = `intelligences:
  default:
    provider: faux
    model: command-model
    reasoning: max
  command:
    provider: faux
    model: command-model
    reasoning: max
  task:
    provider: faux
    model: task-model
    reasoning: xhigh
  stage:
    provider: faux
    model: stage-model
    reasoning: high
  container:
    provider: faux
    model: container-model
    reasoning: medium
  flow:
    provider: faux
    model: flow-model
    reasoning: low
  assembly:
    provider: faux
    model: assembly-model
    reasoning: minimal
`;

type Parts = { assembly?: string; flow?: string; container?: string; stage?: string; task?: string };

async function tree(root: string, home: string, parts: Parts, config = TABLE): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  const stage = parts.container === undefined ? join(flow, "01-work.md") : join(flow, "01-box/01-work.md");
  await mkdir(join(stage, ".."), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), config),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), `---\n${parts.assembly ?? ""}---\nReview.\n`),
    writeFile(join(flow, "FLOW.md"), `---\ndescription: main\n${parts.flow ?? ""}---\n`),
    writeFile(stage, `---\n${parts.stage ?? ""}---\nWork.\n`),
    ...(parts.container === undefined ? [] : [
      writeFile(join(flow, "01-box/LOOP.md"), `---\nrepeat: 1\n${parts.container}---\n`),
      writeFile(join(flow, "02-done.md"), "---\nintelligence: default\n---\nFinish.\n"),
    ]),
    ...(parts.task === undefined ? [] : [writeFile(join(root, "task.md"), `---\n${parts.task}---\nRequest.\n`)]),
  ]);
}

async function checked(parts: Parts, argv: string[] = [], config = TABLE, json = true): Promise<{ code: number; out: string[]; err: string }> {
  const { root, home } = await scratch("bot-intelligences-");
  await tree(root, home, parts, config);
  const capture: Capture = { out: [], err: [] };
  const code = await semanticCheck([ "review/main", ...(parts.task === undefined ? [] : ["@task.md"]), ...(json ? ["--json"] : []), ...argv], boundaryFor(root, home, capture));
  const output = text(capture.out);
  return { code, out: output === "" ? [] : output.trimEnd().split("\n"), err: text(capture.err) };
}

function stageOptions(lines: string[]): Record<string, { value: string; from: string }> {
  const parsed = lines.map((line) => JSON.parse(line) as { type?: string; options?: Record<string, { value: string; from: string }> });
  return parsed.find(({ type }) => type === "STAGE")?.options ?? {};
}

const RUNG_CASES: { name: string; parts: Parts; argv?: string[] }[] = [
  { name: "command", parts: {}, argv: ["--intelligence", "command"] },
  { name: "task", parts: { task: "intelligence: task\n" } },
  { name: "stage", parts: { stage: "intelligence: stage\n" } },
  { name: "container", parts: { container: "intelligence: container\n" } },
  { name: "flow", parts: { flow: "intelligence: flow\n" } },
  { name: "assembly", parts: { assembly: "intelligence: assembly\n" } },
];

for (const { name, parts, argv } of RUNG_CASES) {
  test(`an intelligence named at the ${name} rung supplies its complete bundle`, async () => {
    const held = await checked(parts, argv);
    expect(held.code).toBe(0);
    expect(held.err).toBe("");
    const options = stageOptions(held.out);
    expect(options).toMatchObject({
      intelligence: { value: name, from: name },
      provider: { value: "faux", from: name },
      model: { value: `${name}-model`, from: name },
    });
    expect(options["reasoning"]).toEqual({ value: name === "assembly" ? "minimal" : name === "flow" ? "low" : name === "container" ? "medium" : name === "stage" ? "high" : name === "task" ? "xhigh" : "max", from: name });
  });
}

test("a nearer model flag against a farther intelligence is refused, never silently discarded", async () => {
  // Ruled by Ian, 2026-08-25: there is no model flag — an operator's explicit
  // override is surfaced, not dropped with exit 0. Interim until 0128 removes
  // the old spellings outright.
  for (const flag of [["--model", "operator-model"], ["--provider", "faux"], ["--reasoning", "high"]]) {
    const held = await checked({ assembly: "intelligence: assembly\n" }, flag);
    expect(held.code).toBe(2);
    expect(held.err).toContain("key-unknown");
    expect(held.err).toContain("--intelligence");
  }
});

test("a task file naming an intelligence keeps its request extension", async () => {
  // invocation.md: the request carries "the extension of the task file it came
  // from" — the frontmatter's spelling (model vs intelligence) is not a source.
  const held = await checked({ task: "intelligence: task\n" });
  expect(held.code).toBe(0);
  const parsed = held.out.map((line) => JSON.parse(line) as { type?: string; input?: string[] });
  expect(parsed.find(({ type }) => type === "STAGE")?.input).toEqual(["request.md"]);
});

test("the nearest intelligence supplies the whole bundle and omission uses default", async () => {
  const nearest = await checked({
    assembly: "intelligence: assembly\n", flow: "intelligence: flow\n", container: "intelligence: container\n",
    stage: "intelligence: stage\n", task: "intelligence: task\n",
  }, ["--intelligence", "command"]);
  expect(nearest.code).toBe(0);
  expect(stageOptions(nearest.out)).toMatchObject({
    intelligence: { value: "command", from: "command" }, provider: { value: "faux", from: "command" },
    model: { value: "command-model", from: "command" }, reasoning: { value: "max", from: "command" },
  });

  const implicit = await checked({});
  expect(implicit.code).toBe(0);
  expect(stageOptions(implicit.out)).toMatchObject({ intelligence: { value: "default", from: "home" }, model: { value: "command-model", from: "home" } });
});

test("the retired profiles table refuses with migration guidance", async () => {
  const held = await checked({}, [], `${TABLE}profiles: {}\n`, false);
  expect(held.code).toBe(2);
  expect(held.err).toContain("key-unknown");
  expect(held.err).toContain("--intelligence");
});

test("a providerless intelligence keeps the existing model lookup semantics", async () => {
  const { root, home } = await scratch("bot-intelligence-providerless-");
  await tree(root, home, { stage: "intelligence: quick\n" }, "intelligences:\n  quick:\n    model: shared-model\n    reasoning: low\n");
  const models = createModels();
  models.setProvider(fauxProvider({ provider: "faux-a", models: [{ id: "shared-model" }] }).provider);
  models.setProvider(fauxProvider({ provider: "faux-b", api: "faux-b", models: [{ id: "shared-model" }] }).provider);
  const capture: Capture = { out: [], err: [] };
  await expect(main(["run", "start", "review/main", "request"], { ...boundaryFor(root, home, capture), models })).resolves.toBe(2);
  expect(text(capture.err)).toContain("model-unresolved");
  expect(text(capture.err)).toContain("faux-a");
  expect(text(capture.err)).toContain("faux-b");
});


test("the flat table requires model and reasoning and refuses unknown or invalid bundle keys", async () => {
  const cases = [
    ["intelligences:\n  quick:\n    model: shared-model\n", "key-missing", "Add the required key reasoning to intelligence quick."],
    ["intelligences:\n  quick:\n    reasoning: low\n", "key-missing", "Add the required key model to intelligence quick."],
    ["intelligences:\n  quick:\n    model: shared-model\n    reasoning: low\n    temperature: 0.2\n", "key-unknown", "Remove the unknown key temperature from intelligence quick."],
    ["intelligences:\n  quick:\n    model: shared-model\n    reasoning: turbo\n", "value-invalid", "Give reasoning a valid value in intelligence quick."],
  ] as const;
  for (const [config, code, sentence] of cases) {
    const held = await checked({}, [], config, false);
    expect(held.code).toBe(2);
    expect(held.err).toContain(`${code}  home/config.yaml\n  ${sentence}\n`);
  }
});

test("--intelligence requires a value, and an unknown intelligence or either spelling at one rung refuses", async () => {
  const valueless = await checked({}, ["--intelligence"], TABLE, false);
  expect(valueless.code).toBe(2);
  expect(valueless.err).toBe("request-invalid  --intelligence\n  Supply a value for --intelligence.\n");


  const missing = await checked({ stage: "intelligence: mistyped\n" }, [], TABLE, false);
  expect(missing.code).toBe(2);
  expect(missing.err).toBe("intelligence-unresolved  flows/main/01-work.md\n  Define an intelligence named mistyped in the home configuration, or name one it defines: assembly, command, container, default, flow, stage, task.\n");

  for (const old of ["model: old-model", "provider: faux", "reasoning: high", "profile: coder", "tier: hard"]) {
    const key = old.slice(0, old.indexOf(":"));
    const held = await checked({ stage: `intelligence: stage\n${old}\n` }, [], TABLE, false);
    expect(held.code).toBe(2);
    expect(held.err).toContain("key-unknown");
    expect(held.err).toContain(key);
  }
});

test("all intelligence names refuse before run_start and a started run keeps its table snapshot private", async () => {
  const { root, home } = await scratch("bot-intelligence-run-");
  const config = join(home, "config.yaml");
  const base = join(home, "assemblies/review/flows/main");
  await mkdir(base, { recursive: true });
  await Promise.all([
    writeFile(config, `intelligences:\n  quick:\n    provider: faux\n    model: faux-1\n    reasoning: low\n`),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: quick\n---\nReview.\n"),
    writeFile(join(base, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(base, "01-first.md"), "---\n---\nFirst.\n"),
    writeFile(join(base, "02-last.md"), "---\nintelligence: missing\n---\nLast.\n"),
  ]);
  const refused: Capture = { out: [], err: [] };
  await expect(main(["run", "start", "review/main", "request"], boundaryFor(root, home, refused))).resolves.toBe(2);
  expect(text(refused.err)).toContain("intelligence-unresolved  flows/main/02-last.md");
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);

  await writeFile(join(base, "02-last.md"), "---\n---\nLast.\n");
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }, { id: "faux-2" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const prompts: string[] = [];
  const watch = (message: ReturnType<typeof fauxAssistantMessage>, rewrite = false) => async (context: Context) => {
    prompts.push(context.systemPrompt ?? "", ...context.messages.filter(({ role }) => role === "user").map((item) => JSON.stringify(item)));
    if (rewrite) await writeFile(config, "intelligences:\n  quick:\n    provider: faux\n    model: faux-2\n    reasoning: max\n");
    return message;
  };
  faux.setResponses([
    watch(fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "one" })], { stopReason: "toolUse" })),
    watch(fauxAssistantMessage("done"), true),
    watch(fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "two" })], { stopReason: "toolUse" })),
    watch(fauxAssistantMessage("done")),
  ]);
  const capture: Capture = { out: [], err: [] };
  const boundary: CliBoundary = { ...boundaryFor(root, home, capture), models };
  await expect(main(["run", "start", "review/main", "request"], boundary)).resolves.toBe(0);
  const run = (await readdir(join(home, "runs"))).find((name) => !name.endsWith(".lock")) ?? "";
  const events = (await readFile(join(home, "runs", run, "record.jsonl"), "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  const turns = events.filter((event) => event["event"] === "turn");
  expect(turns.length).toBeGreaterThan(0);
  expect(turns.every((event) => event["model"] === "faux-1")).toBe(true);
  const starts = events.filter((event) => event["event"] === "stage_start");
  expect(starts.length).toBeGreaterThan(0);
  expect(starts.every((event) => JSON.stringify(event["options"]).includes('"intelligence"'))).toBe(true);
  expect(prompts.join("\n")).not.toMatch(/\bintelligence\b/u);
});
