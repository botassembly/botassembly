// Ticket 0128 restates cross-rung model-choice tests with named intelligences.
import { semanticCheck } from "./semantic-check.ts";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, text, type Capture } from "./assembly-home.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

test("a nearer intelligence supplies one complete bundle with rung provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-intelligence-chain-"));
  roots.push(root);
  const home = join(root, "home");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  broad:\n    model: faux-1\n    reasoning: low\n  near:\n    provider: faux\n    model: faux-2\n    reasoning: high\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: broad\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\nintelligence: near\n---\nWork.\n"),
  ]);
  const capture: Capture = { out: [], err: [] };
  await expect(semanticCheck([ "review/main", "--json"], boundaryFor(root, home, capture))).resolves.toBe(0);
  const parsed = JSON.parse(text(capture.out).trim()) as { options: Record<string, unknown> };
  const options = parsed.options;
  expect(options).toMatchObject({
    intelligence: { value: "near", from: "stage" },
    provider: { value: "faux", from: "stage" },
    model: { value: "faux-2", from: "stage" },
    reasoning: { value: "high", from: "stage" },
  });
});
