// Ticket 0128 restates model relief with named intelligences. A stage or
// container can name the bundle used by its executing agent; containers that
// execute no agent do not independently require the reserved default.
import { semanticCheck } from "./semantic-check.ts";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, text, type Capture } from "./assembly-home.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

interface Result { code: number; out: string; err: string; root: string; home: string }

async function checked(where: "stage" | "container", config = true): Promise<Result> {
  const root = await mkdtemp(join(tmpdir(), "bot-relief-"));
  roots.push(root);
  const home = join(root, "home");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(join(flow, "01-box"), { recursive: true });
  await Promise.all([
    ...(config
      ? [writeFile(join(home, "config.yaml"), "intelligences:\n  worker: { provider: faux, model: faux-1, reasoning: high }\n")]
      : []),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-box/LOOP.md"), `---\nrepeat: 1\n${where === "container" ? "intelligence: worker\n" : ""}---\n`),
    writeFile(join(flow, "01-box/01-work.md"), `---\n${where === "stage" ? "intelligence: worker\n" : ""}---\nWork.\n`),
    writeFile(join(flow, "02-done.md"), "---\nintelligence: worker\n---\nDone.\n"),
  ]);
  const capture: Capture = { out: [], err: [] };
  const code = await semanticCheck([ "review/main", "--json"], boundaryFor(root, home, capture));
  return { code, out: text(capture.out), err: text(capture.err), root, home };
}

test.each(["stage", "container"] as const)("a named intelligence at %s scope relieves the executing stage", async (where) => {
  const answer = await checked(where);
  expect(answer.code).toBe(0);
  const parsed = answer.out.trim().split("\n")
    .map((line) => JSON.parse(line) as { stage: string; options: Record<string, unknown> });
  const options = parsed.find((line) => line.stage.includes("01-work"))?.options ?? {};
  expect(options.model).toEqual({ value: "faux-1", from: where });
});

test("a container without a model choice does not require the default row", async () => {
  const answer = await checked("stage");
  expect(answer.code).toBe(0);
  expect(answer.err).toBe("");
  const loop = answer.out.trim().split("\n")
    .map((line) => JSON.parse(line) as { type: string; options: Record<string, unknown> })
    .find(({ type }) => type === "LOOP");
  expect(loop?.options).toEqual({
    timeout: { value: 3600, from: "default" },
    retries: { value: 2, from: "default" },
    "local-context": { value: "ignore", from: "default" },
  });
});

test("only an executing holder with an unresolved intelligence is refused", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-relief-unresolved-"));
  roots.push(root);
  const home = join(root, "home");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  worker: { model: faux-1, reasoning: high }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-ready.md"), "---\nintelligence: worker\n---\nReady.\n"),
    writeFile(join(flow, "02-missing.md"), "---\nintelligence: absent\n---\nMissing.\n"),
  ]);
  const capture: Capture = { out: [], err: [] };
  await expect(semanticCheck([ "review/main"], boundaryFor(root, home, capture))).resolves.toBe(2);
  expect(text(capture.err)).toBe(
    "intelligence-unresolved  flows/main/02-missing.md\n" +
    "  Define an intelligence named absent in the home configuration, or name one it defines: worker.\n",
  );
});

test("the assembly agent itself still requires a resolvable intelligence", async () => {
  const answer = await checked("stage");
  expect(answer.code).toBe(0);
  const capture: Capture = { out: [], err: [] };
  await expect(semanticCheck([ "review"], boundaryFor(answer.root, answer.home, capture))).resolves.toBe(2);
  expect(text(capture.err)).toBe(
    "intelligence-unresolved  ASSEMBLY.md\n" +
    "  Define an intelligence named default in the home configuration, or name one it defines: worker.\n",
  );
});
