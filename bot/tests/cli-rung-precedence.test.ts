// Ticket 0128 restates model-choice precedence as six intelligence rungs plus
// the reserved implicit default.
import { semanticCheck } from "./semantic-check.ts";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, text, type Capture } from "./assembly-home.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const names = ["command", "task", "stage", "container", "flow", "assembly"] as const;

test.each(names.map((name, index) => [name, index] as const))("%s intelligence wins at its rung", async (name, index) => {
  const root = await mkdtemp(join(tmpdir(), "bot-rungs-"));
  roots.push(root);
  const home = join(root, "home");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(join(flow, "01-box"), { recursive: true });
  const rows = [...names, "default"]
    .map((held) => `  ${held}: { provider: faux, model: ${held}-model, reasoning: medium }`)
    .join("\n");
  const active = new Set(names.slice(index));
  await Promise.all([
    writeFile(join(home, "config.yaml"), `intelligences:\n${rows}\n`),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), `---\n${active.has("assembly") ? "intelligence: assembly\n" : ""}---\nReview.\n`),
    writeFile(join(flow, "FLOW.md"), `---\ndescription: main\n${active.has("flow") ? "intelligence: flow\n" : ""}---\n`),
    writeFile(join(flow, "01-box/LOOP.md"), `---\nrepeat: 1\n${active.has("container") ? "intelligence: container\n" : ""}---\n`),
    writeFile(join(flow, "01-box/01-work.md"), `---\n${active.has("stage") ? "intelligence: stage\n" : ""}---\nWork.\n`),
    writeFile(join(flow, "02-done.md"), "---\n---\nDone.\n"),
    ...(active.has("task") ? [writeFile(join(root, "task.md"), "---\nintelligence: task\n---\nRequest.\n")] : []),
  ]);
  const capture: Capture = { out: [], err: [] };
  const args = [
    "review/main",
    ...(active.has("task") ? ["@task.md"] : []),
    "--json",
    ...(active.has("command") ? ["--intelligence", "command"] : []),
  ];
  await expect(semanticCheck(args, boundaryFor(root, home, capture))).resolves.toBe(0);
  const parsed = text(capture.out).trim().split("\n")
    .map((line) => JSON.parse(line) as { stage: string; options: Record<string, unknown> });
  const options = parsed.find((line) => line.stage.includes("01-work"))?.options ?? {};
  expect(options.intelligence).toEqual({ value: name, from: name });
  expect(options.model).toEqual({ value: `${name}-model`, from: name });
});

test("omission resolves default from home", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-rungs-default-"));
  roots.push(root);
  const home = join(root, "home");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { model: faux-1, reasoning: low }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nWork.\n"),
  ]);
  const capture: Capture = { out: [], err: [] };
  await expect(semanticCheck([ "review/main", "--json"], boundaryFor(root, home, capture))).resolves.toBe(0);
  const parsed = JSON.parse(text(capture.out).trim()) as { options: { intelligence: unknown } };
  expect(parsed.options.intelligence).toEqual({ value: "default", from: "home" });
});
