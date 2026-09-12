import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createHarness, NodeExecutionEnvironment } from "../src/harness.ts";
import { readAssembly } from "../src/assembly.ts";
import { runFlow, type GatingSession, type StageRuntimeContext } from "../src/flow.ts";
import type { Assembly, Flow } from "../src/model.ts";
import type { DriverClock } from "../src/process.ts";
import { runStartEvent } from "../src/record-events.ts";
import { createRecordWriter, hashBytes, prehashAssembly } from "../src/record.ts";
import { createRunSignal } from "../src/signal.ts";
import { visibleSkills } from "../src/skills.ts";
import { createControlContext } from "../src/tools.ts";
import { attempt } from "./scratch.ts";
import { bareInvocation, outputOf } from "./hostile.ts";

const roots: string[] = [];
let runNumber = 0;
const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function skill(parent: string, name: string, marker: string): Promise<void> {
  const folder = join(parent, "skills", name);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "SKILL.md"), `---\ndescription: ${marker}\n---\n${marker} body\n`);
}

function capture(captured: StageRuntimeContext[]): (context: StageRuntimeContext) => Promise<GatingSession> {
  return async (context) => {
    captured.push(context);
    const faux = fauxProvider({ tokensPerSecond: 10_000 });
    faux.setResponses([async () => { await writeFile(outputOf(context), "done"); return fauxAssistantMessage("done"); }]);
    const models = createModels();
    models.setProvider(faux.provider);
    const controls = createControlContext();
    const execution = new NodeExecutionEnvironment({ cwd: context.env["PWD"] ?? "/", shellEnv: context.env });
    const harness = await createHarness({
      execution, sessionFile: context.sessionFile, session: { cwd: context.env["PWD"] ?? "/", id: context.identity.stage, createdAt: Date.parse(context.clock.timestamp()) },
      models, model: faux.getModel(), systemPrompt: "Skills materialization test.", tools: context.tools, context: controls,
    });
    return {
      harness, controls, close: () => harness.close(),
      config: {
        mode: "stage", prompt: "Do the work.", timeoutMs: 2_000, retries: 0,
        cwd: context.env["PWD"] ?? "/", env: context.env, session: context.sessionPath,
        received: context.received, options: [], outputPath: outputOf(context), outputExtension: "txt",
      },
    };
  };
}

async function run(held: Assembly, flow: Flow): Promise<{ scratch: string; captured: StageRuntimeContext[] }> {
  const workspace = await mkdtemp(join(tmpdir(), "bot-skills-run-"));
  roots.push(workspace);
  const runs = join(workspace, "runs");
  const scratch = join(workspace, "scratch");
  await Promise.all([mkdir(runs), mkdir(scratch)]);
  const requestPath = join(workspace, "request.txt");
  await writeFile(requestPath, "request bytes");
  const first = runStartEvent({
    ts: clock.timestamp(), run: `2026-08-01T09-00-${String(runNumber++).padStart(2, "0")}-feed`,
    assembly: "skills-test", assemblyHash: "b".repeat(64), flow: flow.name,
    request: { path: "request.txt", sha256: hashBytes("request bytes"), bytes: 13, via: "stdin" },
  });
  const writer = await createRecordWriter(runs, first);
  if (writer.status !== "created") throw new Error("Temporary run name collided.");
  await writeFile(join(writer.writer.runDirectory, "request.txt"), "request bytes");
  const signal = createRunSignal(clock);
  const captured: StageRuntimeContext[] = [];
  const result = await runFlow({
    assembly: held, flow, writer: writer.writer,
    request: { name: "request", extension: "txt", diskPath: requestPath, record: first.request },
    workdir: workspace, scratchDirectory: scratch, baseEnv: {}, slots: {}, invocation: bareInvocation(), home: { options: {}, intelligences: {} },
    metadata: { assembly: "skills-test", assemblyHash: "b".repeat(64), installationId: "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8" }, clock, signal, progress: () => undefined,
    createGating: capture(captured),
  });
  expect(result).toMatchObject({ exit: 0, cause: "success" });
  return { scratch, captured };
}

test("stage preparation flattens all three skill scopes, narrowest winning, whole folders copied", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-skills-assembly-"));
  roots.push(root);
  await mkdir(join(root, "flows/main/01-work"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\n{}\n---\nAssembly.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(root, "flows/main/01-work/STAGE.md"), "---\n{}\n---\nWork.\n"),
    skill(root, "diamond", "assembly diamond"),
    skill(root, "clash", "assembly clash"),
    skill(root, "brioche", "assembly brioche"),
    skill(join(root, "flows/main"), "cantaloupe", "flow cantaloupe"),
    skill(join(root, "flows/main"), "clash", "flow clash"),
    skill(join(root, "flows/main"), "brioche", "flow brioche"),
    skill(join(root, "flows/main/01-work"), "apple", "stage apple"),
    skill(join(root, "flows/main/01-work"), "clash", "stage clash"),
  ]);
  await mkdir(join(root, "skills/diamond/scripts"), { recursive: true });
  await writeFile(join(root, "skills/diamond/scripts/run.sh"), "#!/bin/sh\necho diamond\n");
  const parsed = readAssembly(root, {});
  expect(parsed.faults).toEqual([]);
  const main = parsed.flows.get("main");
  if (main === undefined) throw new Error("The fixture flow did not parse.");
  const { scratch, captured } = await run(parsed, main);
  const context = captured[0];
  if (context === undefined) throw new Error("No stage context was captured.");
  const skillsPath = context.slots["SKILLS"];
  expect(skillsPath).toBe(join(attempt(scratch, "01-work"), "skills"));
  expect(context.env["SKILLS"]).toBe(skillsPath);
  if (skillsPath === undefined) throw new Error("SKILLS was not in the slot map.");
  expect((await readdir(skillsPath)).sort()).toEqual(["apple", "brioche", "cantaloupe", "clash", "diamond"]);
  expect(await readFile(join(skillsPath, "clash/SKILL.md"), "utf8")).toContain("stage clash");
  expect(await readFile(join(skillsPath, "brioche/SKILL.md"), "utf8")).toContain("flow brioche");
  expect(await readFile(join(skillsPath, "apple/SKILL.md"), "utf8")).toContain("stage apple");
  expect(await readFile(join(skillsPath, "diamond/scripts/run.sh"), "utf8")).toBe("#!/bin/sh\necho diamond\n");
  expect((await lstat(join(skillsPath, "diamond"))).isSymbolicLink()).toBe(false);
});

test("a stage with no visible skills still gets an empty SKILLS directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-skills-empty-"));
  roots.push(root);
  await mkdir(join(root, "flows/main"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\n{}\n---\nAssembly.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(root, "flows/main/01-bare.md"), "---\n{}\n---\nBare.\n"),
  ]);
  const parsed = readAssembly(root, {});
  expect(parsed.faults).toEqual([]);
  const main = parsed.flows.get("main");
  if (main === undefined) throw new Error("The fixture flow did not parse.");
  const { captured } = await run(parsed, main);
  const skillsPath = captured[0]?.slots["SKILLS"];
  if (skillsPath === undefined) throw new Error("SKILLS was not in the slot map.");
  expect(await readdir(skillsPath)).toEqual([]);
});

// Ticket 0057 — a container is a skills scope (skills.md): its skills belong to
// every stage beneath it, in a PARALLEL to every branch, and a stage's own skill
// of the same name still wins. The corpus witnesses visibility in check output;
// only the materialized bytes can witness WHICH skill won a collision.
test("a container's skills reach every stage beneath it, and a stage's own skill of the same name overrides", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-skills-container-"));
  roots.push(root);
  await mkdir(join(root, "flows/main/01-fan/left"), { recursive: true });
  await mkdir(join(root, "flows/main/01-fan/right"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\n{}\n---\nAssembly.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(root, "flows/main/01-fan/PARALLEL.md"), "---\n{}\n---\n"),
    writeFile(join(root, "flows/main/01-fan/left/STAGE.md"), "---\n{}\n---\nLeft.\n"),
    writeFile(join(root, "flows/main/01-fan/right/STAGE.md"), "---\n{}\n---\nRight.\n"),
    writeFile(join(root, "flows/main/02-join.md"), "---\n{}\n---\nJoin.\n"),
    skill(join(root, "flows/main/01-fan"), "compass", "container compass"),
    skill(join(root, "flows/main/01-fan"), "sextant", "container sextant"),
    // The narrower scope of one branch collides with the container's name.
    skill(join(root, "flows/main/01-fan/right"), "compass", "stage compass"),
  ]);
  const parsed = readAssembly(root, {});
  expect(parsed.faults).toEqual([]);
  const main = parsed.flows.get("main");
  if (main === undefined) throw new Error("The fixture flow did not parse.");
  const { captured } = await run(parsed, main);

  const skillsOf = async (stage: string): Promise<string[]> => {
    const context = captured.find((held) => held.identity.stage === stage);
    const path = context?.slots["SKILLS"];
    if (path === undefined) throw new Error(`No SKILLS for ${stage}.`);
    return (await readdir(path)).sort();
  };
  const bodyOf = async (stage: string, name: string): Promise<string> => {
    const context = captured.find((held) => held.identity.stage === stage);
    const path = context?.slots["SKILLS"];
    if (path === undefined) throw new Error(`No SKILLS for ${stage}.`);
    return readFile(join(path, name, "SKILL.md"), "utf8");
  };

  // Every branch beneath the container sees the container's skills.
  expect(await skillsOf("01-fan/left")).toEqual(["compass", "sextant"]);
  expect(await skillsOf("01-fan/right")).toEqual(["compass", "sextant"]);
  expect(await bodyOf("01-fan/left", "compass")).toContain("container compass");
  // Narrowest wins: the branch's own compass overrides the container's.
  expect(await bodyOf("01-fan/right", "compass")).toContain("stage compass");
  expect(await bodyOf("01-fan/right", "sextant")).toContain("container sextant");
  // The container's scope ends at its folder: the stage after it sees nothing.
  expect(await skillsOf("02-join")).toEqual([]);
});

// Ticket 0073 — one visibility rule. graph.md: hidden dot-entries "are not
// hashed, and nothing in them is executed". `collectAssemblyFiles`, the walk
// behind `assembly_hash`, obeys that; materialization must obey it too, or
// `$SKILLS` holds bytes the model can read that the run's identity does not
// cover. Nested is the case that matters: a filter applied only to a skill's
// top level leaves `scripts/.payload` in the tree the agent reads.
test("materialization skips the dot entries the hash skips, at every depth, and keeps the visible ones", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-skills-dot-"));
  roots.push(root);
  await mkdir(join(root, "flows/main"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\n{}\n---\nAssembly.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(root, "flows/main/01-work.md"), "---\n{}\n---\nWork.\n"),
    skill(root, "diamond", "assembly diamond"),
  ]);
  await mkdir(join(root, "skills/diamond/scripts/.nested"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "skills/diamond/.payload"), "top level\n"),
    writeFile(join(root, "skills/diamond/scripts/.payload"), "nested\n"),
    writeFile(join(root, "skills/diamond/scripts/.nested/deep.txt"), "under a dot directory\n"),
    writeFile(join(root, "skills/diamond/scripts/run.sh"), "#!/bin/sh\necho diamond\n"),
  ]);
  const parsed = readAssembly(root, {});
  expect(parsed.faults).toEqual([]);
  const main = parsed.flows.get("main");
  if (main === undefined) throw new Error("The fixture flow did not parse.");
  const { captured } = await run(parsed, main);
  const skillsPath = captured[0]?.slots["SKILLS"];
  if (skillsPath === undefined) throw new Error("SKILLS was not in the slot map.");

  // What the run's identity covers: no dot entry, at any depth.
  const hashed = [...(await prehashAssembly(root)).files.keys()];
  expect(hashed.filter((path) => path.split("/").some((part) => part.startsWith(".")))).toEqual([]);
  expect(hashed).toContain("skills/diamond/scripts/run.sh");

  // What the model can read: the same set, and no more.
  const materialized = (await readdir(skillsPath, { recursive: true })).sort();
  expect(materialized.filter((path) => path.split("/").some((part) => part.startsWith(".")))).toEqual([]);
  // The falsification a top-level-only filter survives and this one does not.
  expect(materialized).not.toContain(join("diamond", "scripts", ".payload"));
  // And this is not "materialize less": every visible file is still there.
  expect(materialized).toEqual(["diamond", "diamond/SKILL.md", "diamond/scripts", "diamond/scripts/run.sh"]);
  expect(await readFile(join(skillsPath, "diamond/scripts/run.sh"), "utf8")).toBe("#!/bin/sh\necho diamond\n");
});

// Ticket 0057, the sentence a run cannot show: skills.md says a container's
// skills belong to the stages BENEATH it, so the agent making a choice does not
// read the choice folder's own skills — the stages it chooses between do.
// visibleSkills is the one flattening both `bot check` and the run consult.
test("a chooser does not see its own container's skills; the stages beneath it do", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-skills-chooser-"));
  roots.push(root);
  await mkdir(join(root, "flows/main/01-pick/apple"), { recursive: true });
  await mkdir(join(root, "flows/main/01-pick/banana"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\n{}\n---\nAssembly.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(root, "flows/main/01-pick/CHOOSE.md"), "---\n{}\n---\n\n- `apple` — one\n- `banana` — two\n"),
    writeFile(join(root, "flows/main/01-pick/apple/STAGE.md"), "---\n{}\n---\nApple.\n"),
    writeFile(join(root, "flows/main/01-pick/banana/STAGE.md"), "---\n{}\n---\nBanana.\n"),
    writeFile(join(root, "flows/main/02-tail.md"), "---\n{}\n---\nTail.\n"),
    skill(join(root, "flows/main/01-pick"), "compass", "container compass"),
  ]);
  const parsed = readAssembly(root, {});
  expect(parsed.faults).toEqual([]);
  const main = parsed.flows.get("main");
  const choose = main?.sequence.nodes[0];
  if (main === undefined || choose?.kind !== "CHOOSE") throw new Error("The fixture did not parse as a CHOOSE.");
  const beneath = choose.alternatives[0]?.sequence.nodes[0];
  if (beneath?.kind !== "STAGE") throw new Error("The branch did not parse as a stage.");

  // The chooser runs with the container NOT yet on its chain — its own folder's
  // skills are not its to read.
  expect([...visibleSkills(parsed, main, [], choose, new Map()).keys()]).toEqual([]);
  // A stage beneath it runs with the container on the chain, and sees them.
  expect([...visibleSkills(parsed, main, [choose], beneath, new Map()).keys()]).toEqual(["compass"]);
});
