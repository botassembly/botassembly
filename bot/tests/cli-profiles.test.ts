// Ticket 0128 replaces the former two-axis model-choice tests with the flat
// intelligence contract while retaining strict bundle validation.
import { semanticCheck } from "./semantic-check.ts";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, text, type Capture } from "./assembly-home.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function checked(config: string): Promise<{ code: number; out: string; err: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-intelligence-bundle-"));
  roots.push(root);
  const home = join(root, "home");
  await mkdir(join(home, "assemblies/review/flows/main"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), config),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: worker\n---\nReview.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(home, "assemblies/review/flows/main/01-work.md"), "---\n---\nWork.\n"),
  ]);
  const capture: Capture = { out: [], err: [] };
  const code = await semanticCheck([ "review/main", "--json"], boundaryFor(root, home, capture));
  return { code, out: text(capture.out), err: text(capture.err) };
}

test("a complete intelligence bundle keeps its name and bundle provenance", async () => {
  const answer = await checked("intelligences:\n  worker:\n    provider: faux\n    model: faux-1\n    reasoning: high\n");
  expect(answer.code).toBe(0);
  const parsed = JSON.parse(answer.out.trim()) as { options: Record<string, unknown> };
  const options = parsed.options;
  expect(options).toMatchObject({
    intelligence: { value: "worker", from: "assembly" },
    provider: { value: "faux", from: "assembly" },
    model: { value: "faux-1", from: "assembly" },
    reasoning: { value: "high", from: "assembly" },
  });
});

test.each([
  ["missing model", "intelligences:\n  worker:\n    reasoning: low\n", "key-missing"],
  ["missing reasoning", "intelligences:\n  worker:\n    model: faux-1\n", "key-missing"],
  ["unknown field", "intelligences:\n  worker:\n    model: faux-1\n    reasoning: low\n    temperature: 1\n", "key-unknown"],
])("strict bundle validation refuses %s", async (_name, config, code) => {
  const answer = await checked(config);
  expect(answer.code).toBe(2);
  expect(answer.err).toContain(code);
});
