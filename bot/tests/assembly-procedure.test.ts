import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { readAssembly } from "../src/assembly.ts";
import { renderFlow } from "../src/check.ts";
import type { Invocation } from "../src/model.ts";
import { scopedSubflows } from "../src/subflow-scope.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const invocation: Invocation = {
  target: "review/main", requestExtension: "json", taskOptions: { timeout: 91 }, commandOptions: { retries: 7 },
  supplied: new Map(), valueless: new Set(), home: "/home", faults: [],
};

async function procedureFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-procedure-"));
  roots.push(root);
  for (const path of [
    "flows/main/01-enter/subflows/local", "flows/recur", "subflows/shared", "subflows/down", "subflows/down/subflows/down",
    "subflows/down/02-override/subflows/down",
  ]) await mkdir(join(root, path), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: assembly\n---\nAssembly.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\nintelligence: root\n---\n"),
    writeFile(join(root, "flows/main/01-enter/STAGE.md"), "---\n---\nEnter.\n"),
    writeFile(join(root, "flows/main/01-enter/subflows/local/FLOW.md"), "---\ndescription: local\nintelligence: local\n---\n"),
    writeFile(join(root, "flows/main/01-enter/subflows/local/01-same.md"), "---\n---\nLocal.\n"),
    writeFile(join(root, "flows/main/02-same.md"), "---\n---\nMain.\n"),
    writeFile(join(root, "flows/recur/DESCEND.md"), "---\ndescription: recur\nmax-depth: 2\nintelligence: child\ntimeout: 44\n---\n"),
    writeFile(join(root, "flows/recur/01-work.md"), "---\n---\nRecur.\n"),
    writeFile(join(root, "subflows/shared/FLOW.md"), "---\ndescription: shared\nintelligence: shared\n---\n"),
    writeFile(join(root, "subflows/shared/01-same.md"), "---\n---\nShared.\n"),
    writeFile(join(root, "subflows/down/DESCEND.md"), "---\ndescription: down\nmax-depth: 2\nintelligence: child\n---\n"),
    writeFile(join(root, "subflows/down/01-down.md"), "---\n---\nDown.\n"),
    writeFile(join(root, "subflows/down/02-override/STAGE.md"), "---\n---\nOverride.\n"),
    writeFile(join(root, "subflows/down/02-override/subflows/down/FLOW.md"), "---\ndescription: override\n---\n"),
    writeFile(join(root, "subflows/down/02-override/subflows/down/01-override.md"), "---\n---\nOverride.\n"),
    writeFile(join(root, "subflows/down/03-done.md"), "---\n---\nDone.\n"),
    writeFile(join(root, "subflows/down/subflows/down/FLOW.md"), "---\ndescription: hidden\n---\n"),
    writeFile(join(root, "subflows/down/subflows/down/01-hidden.md"), "---\n---\nHidden.\n"),
  ]);
  return root;
}

test("assembly check emits reachable definitions and nodes once with root and child contexts", async () => {
  const root = await procedureFixture();
  const assembly = readAssembly(root, {});
  const flow = assembly.flows.get("main");
  if (flow === undefined) throw new Error("fixture lost main");
  const home = { options: {}, intelligences: {
    assembly: { model: "assembly-model", reasoning: "low" as const }, root: { model: "root-model", reasoning: "low" as const },
    local: { model: "local-model", reasoning: "low" as const }, shared: { model: "shared-model", reasoning: "low" as const },
    child: { model: "child-model", reasoning: "low" as const }, default: { model: "default-model", reasoning: "low" as const },
  } };
  const rows = renderFlow(invocation, assembly, flow, home, assembly.faults, root).map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(assembly.faults).toEqual([]);
  expect(rows.map(({ stage }) => stage)).toEqual([
    "flows/main/FLOW.md", "01-enter", "02-same",
    "flows/main/01-enter/subflows/local/FLOW.md", "01-same",
    "subflows/down/DESCEND.md", "01-down", "02-override", "03-done",
    "subflows/down/02-override/subflows/down/FLOW.md", "01-override",
    "subflows/down/subflows/down/FLOW.md", "01-hidden",
    "subflows/shared/FLOW.md", "01-same",
  ]);
  expect(rows[0]).toEqual({ stage: "flows/main/FLOW.md", flow: "flows/main", type: "FLOW", max_subflow_calls: 10 });
  expect(rows[1]).toMatchObject({ flow: "flows/main", input: ["request.json"] });
  expect(rows[3]).toEqual({ stage: "flows/main/01-enter/subflows/local/FLOW.md", flow: "flows/main/01-enter/subflows/local", type: "FLOW", max_subflow_calls: 10 });
  expect(rows[4]).toMatchObject({ flow: "flows/main/01-enter/subflows/local", input: ["request.<runtime>"], options: { timeout: { value: 3600, from: "default" }, retries: { value: 2, from: "default" } } });
  expect(rows[5]).toEqual({ stage: "subflows/down/DESCEND.md", flow: "subflows/down", type: "DESCEND", max_subflow_calls: 10, max_depth: 2 });
  expect(rows.filter(({ flow: held }) => held === "subflows/down")).toHaveLength(4);
  expect(rows.filter(({ stage }) => stage === "01-same")).toHaveLength(2);
});

test("a selected DESCEND flow keeps root options and exposes its separate child context", async () => {
  const root = await procedureFixture();
  const assembly = readAssembly(root, {});
  const flow = assembly.flows.get("recur");
  if (flow === undefined) throw new Error("fixture lost recur");
  const home = { options: {}, intelligences: {
    child: { model: "child-model", reasoning: "low" as const },
    default: { model: "default-model", reasoning: "low" as const },
  } };
  const rows = renderFlow(invocation, assembly, flow, home, assembly.faults, root).map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(rows.filter(({ flow: held }) => held === "flows/recur")).toHaveLength(2);
  expect(rows.find(({ flow: held, type }) => held === "flows/recur" && type === "STAGE")).toMatchObject({
    flow: "flows/recur", input: ["request.json"], child_input: ["request.<runtime>"],
    options: { timeout: { value: 91, from: "task" }, retries: { value: 7, from: "command" } },
    child_options: { timeout: { value: 44, from: "flow" }, retries: { value: 2, from: "default" } },
  });
});

test("a selected DESCEND reports artifacts from the exact revealed child scope", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-procedure-artifacts-"));
  roots.push(root);
  for (const path of ["flows/recur/00-plan", "flows/recur/01-spread", "flows/recur/subflows/recur/01-result"]) {
    await mkdir(join(root, path), { recursive: true });
  }
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\n---\nAssembly.\n"),
    writeFile(join(root, "flows/recur/DESCEND.md"), "---\ndescription: recur\nmax-depth: 2\n---\n"),
    writeFile(join(root, "flows/recur/00-plan/STAGE.md"), "---\n---\nPlan.\n"),
    writeFile(join(root, "flows/recur/00-plan/schema.json"), "{\"type\":\"object\"}\n"),
    writeFile(join(root, "flows/recur/01-spread/FANOUT.md"), "---\nitems: jobs\nsubflow: recur\nwidth: 1\nmax-items: 2\n---\n"),
    writeFile(join(root, "flows/recur/02-finish.md"), "---\n---\nFinish.\n"),
    writeFile(join(root, "flows/recur/subflows/recur/FLOW.md"), "---\ndescription: revealed helper\n---\n"),
    writeFile(join(root, "flows/recur/subflows/recur/01-result/STAGE.md"), "---\n---\nReturn JSON.\n"),
    writeFile(join(root, "flows/recur/subflows/recur/01-result/schema.json"), "{\"type\":\"object\"}\n"),
  ]);
  const assembly = readAssembly(root, {}), flow = assembly.flows.get("recur");
  if (flow === undefined) throw new Error("fixture lost recur");
  const rows = renderFlow(invocation, assembly, flow, { options: {}, intelligences: {
    default: { model: "default-model", reasoning: "low" },
  } }, assembly.faults, root).map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(assembly.faults).toEqual([]);
  expect(rows.find(({ flow: path, type }) => path === "flows/recur" && type === "FANOUT")).toMatchObject({
    output: "<item>.txt", child_outputs: ["<item>.json"],
  });
  expect(rows.find(({ flow: path, stage }) => path === "flows/recur" && stage === "02-finish")).toMatchObject({
    input: ["<item>.txt"], child_input: ["<item>.json"],
  });
});

test("short and long routes retain exact ceiling states without duplicate rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-procedure-routes-"));
  roots.push(root);
  await mkdir(join(root, "flows/main"), { recursive: true });
  await mkdir(join(root, "subflows/shared/subflows/leaf"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\n---\nAssembly.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(root, "flows/main/01-work.md"), "---\n---\nWork.\n"),
    writeFile(join(root, "subflows/shared/FLOW.md"), "---\ndescription: shared\n---\n"),
    writeFile(join(root, "subflows/shared/01-work.md"), "---\n---\nWork.\n"),
    writeFile(join(root, "subflows/shared/subflows/leaf/FLOW.md"), "---\ndescription: leaf\n---\n"),
    writeFile(join(root, "subflows/shared/subflows/leaf/01-work.md"), "---\n---\nWork.\n"),
  ]);
  let parent = join(root, "flows/main/subflows");
  for (let depth = 1; depth <= 10; depth += 1) {
    const path = join(parent, `chain-${String(depth)}`);
    await mkdir(path, { recursive: true });
    await Promise.all([
      writeFile(join(path, "FLOW.md"), `---\ndescription: chain ${String(depth)}\n---\n`),
      writeFile(join(path, "01-work.md"), "---\n---\nWork.\n"),
    ]);
    parent = join(path, "subflows");
  }
  const beyond = join(parent, "beyond");
  await mkdir(beyond, { recursive: true });
  await Promise.all([
    writeFile(join(beyond, "FLOW.md"), "---\ndescription: beyond\n---\n"),
    writeFile(join(beyond, "01-work.md"), "---\n---\nWork.\n"),
  ]);
  const assembly = readAssembly(root, {}), flow = assembly.flows.get("main");
  if (flow === undefined) throw new Error("fixture lost main");
  const rows = renderFlow(invocation, assembly, flow, { options: {}, intelligences: {
    default: { model: "default-model", reasoning: "low" },
  } }, assembly.faults, root).map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(rows.filter(({ flow: path }) => path === "subflows/shared")).toHaveLength(2);
  expect(rows.filter(({ flow: path }) => path === "subflows/shared/subflows/leaf")).toHaveLength(2);
  expect(rows.some(({ flow: path }) => typeof path === "string" && path.endsWith("/beyond"))).toBe(false);
});

test("an exhausted hypothetical self route does not invent a FANOUT scope refusal", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-procedure-exhausted-fanout-"));
  roots.push(root);
  for (const path of ["flows/recur/01-plan", "flows/recur/02-spread", "subflows/worker"]) {
    await mkdir(join(root, path), { recursive: true });
  }
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\n---\nAssembly.\n"),
    writeFile(join(root, "flows/recur/DESCEND.md"), "---\ndescription: recur\nmax-depth: 11\n---\n"),
    writeFile(join(root, "flows/recur/01-plan/STAGE.md"), "---\n---\nPlan.\n"),
    writeFile(join(root, "flows/recur/01-plan/schema.json"), "{\"type\":\"object\"}\n"),
    writeFile(join(root, "flows/recur/02-spread/FANOUT.md"), "---\nitems: jobs\nsubflow: worker\nwidth: 1\nmax-items: 2\n---\n"),
    writeFile(join(root, "flows/recur/03-finish.md"), "---\n---\nFinish.\n"),
    writeFile(join(root, "subflows/worker/FLOW.md"), "---\ndescription: worker\n---\n"),
    writeFile(join(root, "subflows/worker/01-work.md"), "---\n---\nWork.\n"),
  ]);
  const assembly = readAssembly(root, {}), flow = assembly.flows.get("recur");
  if (flow === undefined) throw new Error("fixture lost recur");
  renderFlow(invocation, assembly, flow, { options: {}, intelligences: {
    default: { model: "default-model", reasoning: "low" },
  } }, assembly.faults, root);
  expect(assembly.faults).toEqual([]);
});

test("a stage-local subflow shadows same-named wider definitions exclusively", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-procedure-stage-shadow-"));
  roots.push(root);
  for (const path of ["flows/main/01-work/subflows/worker", "flows/main/subflows/worker", "subflows/worker"]) {
    await mkdir(join(root, path), { recursive: true });
  }
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\n---\nAssembly.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(root, "flows/main/01-work/STAGE.md"), "---\n---\nWork.\n"),
    writeFile(join(root, "flows/main/01-work/subflows/worker/FLOW.md"), "---\ndescription: stage worker\n---\n"),
    writeFile(join(root, "flows/main/01-work/subflows/worker/01-stage.md"), "---\n---\nStage.\n"),
    writeFile(join(root, "flows/main/subflows/worker/FLOW.md"), "---\ndescription: flow worker\n---\n"),
    writeFile(join(root, "flows/main/subflows/worker/01-flow.md"), "---\n---\nFlow.\n"),
    writeFile(join(root, "subflows/worker/FLOW.md"), "---\ndescription: assembly worker\n---\n"),
    writeFile(join(root, "subflows/worker/01-assembly.md"), "---\n---\nAssembly.\n"),
  ]);
  const assembly = readAssembly(root, {}), flow = assembly.flows.get("main");
  if (flow === undefined) throw new Error("fixture lost main");
  const stage = flow.sequence.nodes[0];
  if (stage?.kind !== "STAGE") throw new Error("fixture lost stage");
  const stageWorker = stage.subflows.get("worker");
  const scope = scopedSubflows(assembly.subflows, flow, stage, 1, 0);
  expect(stageWorker).toBeDefined();
  expect(scope.get("worker")).toBe(stageWorker);
  expect([...scope.keys()].filter((name) => name === "worker")).toHaveLength(1);
});

test("selected-root intelligence can resolve while its child context refuses", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-procedure-child-intelligence-"));
  roots.push(root);
  await mkdir(join(root, "flows/recur"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\n---\nAssembly.\n"),
    writeFile(join(root, "flows/recur/DESCEND.md"), "---\ndescription: recur\nmax-depth: 2\n---\n"),
    writeFile(join(root, "flows/recur/01-work.md"), "---\n---\nWork.\n"),
  ]);
  const assembly = readAssembly(root, {}), flow = assembly.flows.get("recur");
  if (flow === undefined) throw new Error("fixture lost recur");
  const faults = [...assembly.faults];
  const rootInvocation = { ...invocation, commandOptions: { ...invocation.commandOptions, intelligence: "root" } };
  const rows = renderFlow(rootInvocation, assembly, flow, { options: {}, intelligences: {
    root: { model: "root-model", reasoning: "low" },
  } }, faults, root).map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(rows.find(({ type }) => type === "STAGE")).toMatchObject({
    options: { intelligence: { value: "root", from: "command" }, model: { value: "root-model", from: "command" } },
  });
  expect(faults).toEqual([{
    code: "intelligence-unresolved", path: "flows/recur/01-work.md",
    sentence: "Define an intelligence named default in the home configuration, or name one it defines: root.",
  }]);
});

test("a definition first reachable beyond ten child edges is validated but not reported", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-procedure-ceiling-"));
  roots.push(root);
  await mkdir(join(root, "flows/main"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\n---\nAssembly.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(root, "flows/main/01-work.md"), "---\n---\nWork.\n"),
  ]);
  let parent = join(root, "flows/main/subflows");
  for (let depth = 1; depth <= 11; depth += 1) {
    const flow = join(parent, `child-${String(depth).padStart(2, "0")}`);
    await mkdir(flow, { recursive: true });
    await Promise.all([
      writeFile(join(flow, "FLOW.md"), `---\ndescription: child ${String(depth)}\n${depth === 11 ? "intelligence: missing\n" : ""}---\n`),
      writeFile(join(flow, "01-work.md"), "---\n---\nWork.\n"),
    ]);
    parent = join(flow, "subflows");
  }
  const assembly = readAssembly(root, {}), flow = assembly.flows.get("main");
  if (flow === undefined) throw new Error("fixture lost main");
  const faults = [...assembly.faults];
  const rows = renderFlow(invocation, assembly, flow, { options: {}, intelligences: {
    default: { model: "default-model", reasoning: "low" },
  } }, faults, root).map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(rows.some(({ flow: path }) => typeof path === "string" && path.endsWith("child-11"))).toBe(false);
  expect(faults.some(({ code, path }) => code === "intelligence-unresolved" && path.includes("child-11/01-work.md"))).toBe(true);
});

/** Every `input` array an author could write: a stage refuses two arriving
 *  files that share a source name, so check must never report a pair it would
 *  itself refuse (inspection.md, ticket 0281). */
function collidingInputs(rows: Record<string, unknown>[]): unknown[] {
  return rows.filter((row) => {
    const input = row["input"];
    if (!Array.isArray(input)) return false;
    const sources = input.map((name) => String(name).replace(/\.[^.]*$/u, ""));
    return new Set(sources).size !== sources.length;
  });
}

function renderedRows(root: string, name: string, held: Invocation = invocation): Record<string, unknown>[] {
  const assembly = readAssembly(root, {}), flow = assembly.flows.get(name);
  if (flow === undefined) throw new Error(`fixture lost ${name}`);
  const rows = renderFlow(held, assembly, flow, { options: {}, intelligences: {
    default: { model: "default-model", reasoning: "low" },
  } }, assembly.faults, root).map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(assembly.faults).toEqual([]);
  return rows;
}

const CHOICE = "---\n---\n\n- `escalate` — a person has to look\n- `patch` — fix it where it stands\n";

async function branchFixture(prefix: string, kind: "CHOOSE" | "PARALLEL"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  await mkdir(join(root, "flows/main/01-decide"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\n---\nAssembly.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(root, `flows/main/01-decide/${kind}.md`), kind === "CHOOSE" ? CHOICE : "---\nwidth: 2\n---\n"),
    writeFile(join(root, "flows/main/01-decide/escalate.md"), "---\n---\nEscalate.\n"),
    writeFile(join(root, "flows/main/01-decide/patch.md"), "---\n---\nPatch.\n"),
    writeFile(join(root, "flows/main/99-done.md"), "---\n---\nDone.\n"),
  ]);
  return root;
}

async function depthChoiceFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-procedure-choose-depth-"));
  roots.push(root);
  await mkdir(join(root, "flows/recur/01-decide"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\n---\nAssembly.\n"),
    writeFile(join(root, "flows/recur/DESCEND.md"), "---\ndescription: recur\nmax-depth: 2\n---\n"),
    writeFile(join(root, "flows/recur/01-decide/CHOOSE.md"), CHOICE),
    writeFile(join(root, "flows/recur/01-decide/escalate.md"), "---\n---\nEscalate.\n"),
    writeFile(join(root, "flows/recur/01-decide/patch.md"), "---\n---\nPatch.\n"),
    writeFile(join(root, "flows/recur/99-done.md"), "---\n---\nDone.\n"),
  ]);
  return root;
}

test("the stage after a choice arrives with one file and lists every alternative", async () => {
  const rows = renderedRows(await branchFixture("bot-procedure-choose-", "CHOOSE"), "main");
  expect(rows.find(({ stage }) => stage === "99-done")).toMatchObject({
    input: ["escalate.txt"], possible_inputs: ["escalate.txt", "patch.txt"],
  });
  expect(collidingInputs(rows)).toEqual([]);
});

test("the stage after a parallel keeps every branch file in its arriving input", async () => {
  const rows = renderedRows(await branchFixture("bot-procedure-parallel-", "PARALLEL"), "main");
  const done = rows.find(({ stage }) => stage === "99-done");
  expect(done).toMatchObject({ input: ["escalate.txt", "patch.txt"] });
  expect(done).not.toHaveProperty("possible_inputs");
});

test("a choice inside a depth variant keeps every alternative", async () => {
  const rows = renderedRows(await depthChoiceFixture(), "recur");
  expect(rows.find(({ stage }) => stage === "99-done")).toMatchObject({
    input: ["escalate.txt"], possible_inputs: ["escalate.txt", "patch.txt"],
  });
  expect(collidingInputs(rows)).toEqual([]);
});

test("identical child options are omitted from every row", async () => {
  const plain: Invocation = { ...invocation, requestExtension: "txt", taskOptions: {}, commandOptions: {} };
  const rows = renderedRows(await depthChoiceFixture(), "recur", plain);
  expect(rows.filter((row) => "child_options" in row)).toEqual([]);
});
