import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { readAssembly } from "../src/assembly.ts";
import { renderFlow } from "../src/check.ts";
import type { Invocation } from "../src/model.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(frontmatter = "items: jobs\nsubflow: worker\nwidth: 1\nmax-items: 2\n"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-fanout-static-"));
  roots.push(root);
  await Promise.all([
    mkdir(join(root, "flows/main/01-plan"), { recursive: true }),
    mkdir(join(root, "flows/main/02-run"), { recursive: true }),
    mkdir(join(root, "subflows/worker"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\n{}\n---\nAssembly.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(root, "flows/main/01-plan/STAGE.md"), "---\n{}\n---\nPlan.\n"),
    writeFile(join(root, "flows/main/01-plan/schema.json"), '{"type":"object"}\n'),
    writeFile(join(root, "flows/main/02-run/FANOUT.md"), `---\n${frontmatter}---\n`),
    writeFile(join(root, "flows/main/03-finish.md"), "---\n{}\n---\nFinish.\n"),
    writeFile(join(root, "subflows/worker/FLOW.md"), "---\ndescription: worker\n---\n"),
    writeFile(join(root, "subflows/worker/01-answer.md"), "---\n{}\n---\nAnswer.\n"),
  ]);
  return root;
}

const invocation: Invocation = {
  target: "main", requestExtension: "txt", taskOptions: {}, commandOptions: {}, supplied: new Map(),
  valueless: new Set(), home: join(tmpdir(), "home"), faults: [],
};

test("FANOUT accepts its closed four-key form and has one useful static reading", async () => {
  const root = await fixture();
  const parsed = readAssembly(root, {});
  expect(parsed.faults).toEqual([]);
  const main = parsed.flows.get("main");
  if (main === undefined) throw new Error("fixture lost main flow");
  expect(main.sequence.nodes[1]).toMatchObject({
    kind: "FANOUT", items: "jobs", subflow: "worker", width: 1, maxItems: 2,
  });
  expect(renderFlow(invocation, parsed, main, { options: {}, intelligences: {} }, [], root)
    .map((line) => JSON.parse(line) as Record<string, unknown>)[2]).toMatchObject({
      type: "FANOUT", items: "jobs", subflow: "worker", width: 1, max_items: 2, output: "<item>.txt",
    });
});

test.each([
  ["bad bounds", "items: jobs\nsubflow: worker\nwidth: 3\nmax-items: 2\n"],
  ["missing key", "items: jobs\nsubflow: worker\nwidth: 1\n"],
  ["unknown key", "items: jobs\nsubflow: worker\nwidth: 1\nmax-items: 2\nextra: true\n"],
  ["unresolved subflow", "items: jobs\nsubflow: absent\nwidth: 1\nmax-items: 2\n"],
])("FANOUT refuses %s", async (_name, frontmatter) => {
  const root = await fixture(frontmatter);
  const parsed = readAssembly(root, {});
  const main = parsed.flows.get("main");
  if (main === undefined) throw new Error("fixture lost main flow");
  renderFlow(invocation, parsed, main, { options: {}, intelligences: {} }, parsed.faults, root);
  expect(parsed.faults.length).toBeGreaterThan(0);
});

// Ticket 0282, contradiction C5: fanout.md says the sentinel has exactly four
// keys. The reader used to admit the four stage options as well and then drop
// them, so `intelligence: cheap` on a fan-out earned neither a refusal nor an
// effect.
test.each(["timeout: 60", "retries: 1", "local-context: true", "intelligence: cheap"])(
  "FANOUT refuses the stage option %s", async (option) => {
    const root = await fixture(`items: jobs\nsubflow: worker\nwidth: 1\nmax-items: 2\n${option}\n`);
    const parsed = readAssembly(root, {});
    const key = option.slice(0, option.indexOf(":"));
    expect(parsed.faults).toEqual([{
      code: "key-unknown", path: "flows/main/02-run/FANOUT.md", sentence: `Remove the unknown key ${key}.`,
    }]);
  });

test("FANOUT refuses a non-JSON predecessor", async () => {
  const root = await fixture();
  await rm(join(root, "flows/main/01-plan/schema.json"));
  const parsed = readAssembly(root, {});
  expect(parsed.faults).toContainEqual(expect.objectContaining({ path: "flows/main/02-run" }));
});

test("FANOUT refuses a missing ordinary successor", async () => {
  const root = await fixture();
  await rm(join(root, "flows/main/03-finish.md"));
  const parsed = readAssembly(root, {});
  expect(parsed.faults).toContainEqual(expect.objectContaining({ path: "flows/main/02-run" }));
});

test("FANOUT refuses nested placement", async () => {
  const root = await fixture();
  await Promise.all([
    rm(join(root, "flows/main/02-run"), { recursive: true }),
    rm(join(root, "flows/main/03-finish.md")),
    mkdir(join(root, "flows/main/02-loop/01-plan"), { recursive: true }),
    mkdir(join(root, "flows/main/02-loop/02-run"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, "flows/main/02-loop/LOOP.md"), "---\nrepeat: 1\n---\nquestion\n"),
    writeFile(join(root, "flows/main/02-loop/01-plan/STAGE.md"), "---\n{}\n---\nPlan.\n"),
    writeFile(join(root, "flows/main/02-loop/01-plan/schema.json"), '{"type":"object"}\n'),
    writeFile(join(root, "flows/main/02-loop/02-run/FANOUT.md"), "---\nitems: jobs\nsubflow: worker\nwidth: 1\nmax-items: 2\n---\n"),
    writeFile(join(root, "flows/main/02-loop/03-finish.md"), "---\n{}\n---\nFinish.\n"),
  ]);
  const parsed = readAssembly(root, {});
  expect(parsed.faults).toContainEqual(expect.objectContaining({ path: "flows/main/02-loop/02-run" }));
});

test("FANOUT refuses placement inside a subflow", async () => {
  const root = await fixture();
  await rm(join(root, "subflows/worker/01-answer.md"));
  await Promise.all([
    mkdir(join(root, "subflows/worker/01-plan"), { recursive: true }),
    mkdir(join(root, "subflows/worker/02-run"), { recursive: true }),
    mkdir(join(root, "subflows/leaf"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, "subflows/worker/01-plan/STAGE.md"), "---\n{}\n---\nPlan.\n"),
    writeFile(join(root, "subflows/worker/01-plan/schema.json"), '{"type":"object"}\n'),
    writeFile(join(root, "subflows/worker/02-run/FANOUT.md"), "---\nitems: jobs\nsubflow: leaf\nwidth: 1\nmax-items: 2\n---\n"),
    writeFile(join(root, "subflows/worker/03-finish.md"), "---\n{}\n---\nFinish.\n"),
    writeFile(join(root, "subflows/leaf/FLOW.md"), "---\ndescription: leaf\n---\n"),
    writeFile(join(root, "subflows/leaf/01-answer.md"), "---\n{}\n---\nAnswer.\n"),
  ]);
  const parsed = readAssembly(root, {});
  expect(parsed.faults).toContainEqual(expect.objectContaining({ path: "subflows/worker/02-run" }));
});

test("FANOUT refuses a selected subflow without an ordinary final stage", async () => {
  const root = await fixture();
  await rm(join(root, "subflows/worker/01-answer.md"));
  await mkdir(join(root, "subflows/worker/01-loop"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "subflows/worker/01-loop/LOOP.md"), "---\nrepeat: 1\n---\nquestion\n"),
    writeFile(join(root, "subflows/worker/01-loop/01-answer.md"), "---\n{}\n---\nAnswer.\n"),
  ]);
  const parsed = readAssembly(root, {});
  const main = parsed.flows.get("main");
  if (main === undefined) throw new Error("fixture lost main flow");
  renderFlow(invocation, parsed, main, { options: {}, intelligences: {} }, parsed.faults, root);
  expect(parsed.faults.some(({ path, sentence }) => (
    path === "flows/main/02-run" && sentence.includes("final node is an ordinary stage")
  ))).toBe(true);
});
