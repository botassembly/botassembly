// Ticket 0128 contracts model selection to one authored spelling. These tests
// stay at the reader and CLI boundaries: resolved provider/model/reasoning
// remain observable values, but authors can supply them only through a named
// row in the home's intelligences table.
import { semanticCheck } from "./semantic-check.ts";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "./initialized-cli.ts";
import { boundaryFor, text, type Capture } from "./assembly-home.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

interface TreeParts {
  assembly?: string;
  flow?: string;
  container?: string;
  stage?: string;
  task?: string;
  config?: string;
  bare?: boolean;
}

const DEFAULT_TABLE = `intelligences:
  default:
    provider: faux
    model: faux-1
    reasoning: medium
`;

async function tree(parts: TreeParts = {}): Promise<{ root: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-intelligence-only-"));
  roots.push(root);
  const home = join(root, "home");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(join(flow, "01-box"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), parts.config ?? DEFAULT_TABLE),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), `---\n${parts.assembly ?? (parts.bare === true ? "" : "intelligence: default\n")}---\nReview.\n`),
    writeFile(join(flow, "FLOW.md"), `---\ndescription: main\n${parts.flow ?? ""}---\n`),
    writeFile(join(flow, "01-box/LOOP.md"), `---\nrepeat: 1\n${parts.container ?? ""}---\n`),
    writeFile(join(flow, "01-box/01-work.md"), `---\n${parts.stage ?? ""}---\nWork.\n`),
    writeFile(join(flow, "02-done.md"), "---\n---\nFinish.\n"),
    ...(parts.task === undefined ? [] : [writeFile(join(root, "task.md"), `---\n${parts.task}---\nRequest.\n`)]),
  ]);
  return { root, home };
}

async function check(parts: TreeParts, args: string[] = []): Promise<{ code: number; out: string; err: string }> {
  const held = await tree(parts);
  const capture: Capture = { out: [], err: [] };
  const task = parts.task === undefined ? [] : ["@task.md"];
  const code = await semanticCheck([ "review/main", ...task, "--json", ...args], boundaryFor(held.root, held.home, capture));
  return { code, out: text(capture.out), err: text(capture.err) };
}

function faults(stderr: string): { code: string; path: string; message: string }[] {
  return stderr.trimEnd().split("\n").filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as { code: string; path: string; message: string });
}

function expectMigration(stderr: string, path: string): void {
  const found = faults(stderr).find((held) => held.code === "key-unknown" && held.path === path);
  expect(found).toBeDefined();
  expect(found?.message).toContain("intelligences");
  expect(found?.message).toContain("--intelligence");
}

const RUNG_CASES: { name: string; parts: TreeParts; args?: string[]; path: string }[] = [
  { name: "command", parts: { assembly: "model: faux-1\n" }, args: ["--model", "faux-2"], path: "--model" },
  { name: "task", parts: { assembly: "model: faux-1\n", task: "model: faux-2\n" }, path: "task.md" },
  { name: "stage", parts: { assembly: "model: faux-1\n", stage: "model: faux-2\n" }, path: "flows/main/01-box/01-work.md" },
  { name: "container", parts: { assembly: "model: faux-1\n", container: "model: faux-2\n" }, path: "flows/main/01-box/LOOP.md" },
  { name: "flow", parts: { assembly: "model: faux-1\n", flow: "model: faux-2\n" }, path: "flows/main/FLOW.md" },
  { name: "assembly", parts: { assembly: "model: faux-2\n" }, path: "ASSEMBLY.md" },
];

for (const held of RUNG_CASES) {
  test(`the ${held.name} rung refuses a literal model and points to intelligence`, async () => {
    const answer = await check(held.parts, held.args);
    expect(answer.code).toBe(2);
    expect(answer.out).toBe("");
    expectMigration(answer.err, held.path);
  });
}

const RETIRED_VALUES = {
  provider: "faux",
  reasoning: "high",
  profile: "old-name",
  tier: "old-name",
} as const;

for (const [key, value] of Object.entries(RETIRED_VALUES)) {
  test(`an authored ${key} is refused with the intelligence migration`, async () => {
    const config = key === "profile"
      ? `${DEFAULT_TABLE}profiles:\n  old-name:\n    only:\n      model: faux-2\n`
      : DEFAULT_TABLE;
    const answer = await check({ assembly: "model: faux-1\n", stage: `${key}: ${value}\n`, config });
    expect(answer.code).toBe(2);
    expect(answer.out).toBe("");
    expectMigration(answer.err, "flows/main/01-box/01-work.md");
  });

  test(`the --${key} option is retired with the intelligence migration`, async () => {
    const config = key === "profile"
      ? `${DEFAULT_TABLE}profiles:\n  old-name:\n    only:\n      model: faux-2\n`
      : DEFAULT_TABLE;
    const answer = await check({ assembly: "model: faux-1\n", config }, [`--${key}`, value]);
    expect(answer.code).toBe(2);
    expect(answer.out).toBe("");
    expectMigration(answer.err, `--${key}`);
  });
}

test("the home refuses profiles and loose model-choice keys with the successor", async () => {
  for (const config of [
    "model: faux-1\n", "provider: faux\n", "reasoning: low\n",
    "profiles:\n  coder:\n    hard:\n      model: faux-1\n",
  ]) {
    const answer = await check({ config });
    expect(answer.code).toBe(2);
    expect(answer.err).toContain("key-unknown");
    expect(answer.err).toContain("config.yaml");
  }
});

test("an omitted intelligence lazily resolves the reserved default row", async () => {
  const answer = await check({ bare: true });
  expect(answer.code).toBe(0);
  expect(answer.err).toBe("");
  const stage = answer.out.trimEnd().split("\n")
    .map((line) => JSON.parse(line) as { type?: string; options?: Record<string, { value: unknown; from: string }> })
    .find(({ type }) => type === "STAGE");
  expect(stage?.options).toMatchObject({
    intelligence: { value: "default", from: "home" },
    provider: { value: "faux", from: "home" },
    model: { value: "faux-1", from: "home" },
    reasoning: { value: "medium", from: "home" },
  });
});

test("a missing default row refuses only when check needs a model choice", async () => {
  const answer = await check({ config: "retries: 1\n", bare: true });
  expect(answer.code).toBe(2);
  expect(answer.err).toContain("intelligence-unresolved");
  expect(answer.err).toContain("default");

});

test("CLI help offers intelligence and no retired model-choice options", async () => {
  const held = await tree();
  const capture: Capture = { out: [], err: [] };
  await expect(main(["run", "start", "--help"], boundaryFor(held.root, held.home, capture))).resolves.toBe(0);
  const help = text(capture.out);
  expect(help).toContain("--intelligence");
  for (const option of ["--model", "--provider", "--reasoning", "--profile", "--tier"]) {
    expect(help).not.toContain(option);
  }
});

test("explicit intelligence default is an ordinary row name", async () => {
  const answer = await check({ assembly: "intelligence: default\n" });
  expect(answer.code).toBe(0);
  expect(answer.err).toBe("");
});
