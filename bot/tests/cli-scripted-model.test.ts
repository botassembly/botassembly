// `--script` is a caller-facing model boundary: this test deliberately supplies
// no injected Models collection. The assembly names a provider that this
// machine cannot call, so success can only mean the CLI installed its scripted
// stand-in before model resolution.
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { at, events, realBoundary, runsIn, tempRoots } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

async function assembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  const first = join(flow, "01-draft");
  await mkdir(first, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(first, "STAGE.md"), "---\n---\nDraft the answer.\n"),
    writeFile(join(first, "gate"), "#!/bin/sh\ntest \"$(cat \"$OUTPUT\")\" = alpha\n"),
    writeFile(join(flow, "02-report.md"), "---\n---\nReport the answer.\n"),
  ]);
  await chmod(join(first, "gate"), 0o755);
}

async function scriptedRun(home: string, root: string, output: Buffer[], errors: Buffer[]): Promise<number> {
  const script = join(root, "stand-in.json");
  await writeFile(script, JSON.stringify([
    [{ type: "toolCall", id: "draft", name: "write", arguments: { path: "$OUTPUT", content: "alpha" } }],
    "The draft is ready.",
    [{ type: "toolCall", id: "report", name: "write", arguments: { path: "$OUTPUT", content: "beta" } }],
    "The report is ready.",
  ]));
  const { held } = realBoundary(root, home, output, errors);
  const { models: _models, ...withoutInjectedModel } = held;
  return main(["run", "start", "review/main", "the request", "--script", "stand-in.json"], withoutInjectedModel);
}

test("a scripted stand-in runs every stage and records that it was scripted", async () => {
  const { root, home } = await roots.scratch("bot-scripted-model-");
  await assembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  await expect(scriptedRun(home, root, stdout, stderr)).resolves.toBe(0);
  expect(Buffer.concat(stdout).toString()).toBe("beta");
  expect(Buffer.concat(stderr).toString()).toBe("");

  const run = at(await runsIn(home), 0);
  const record = await events(join(home, "runs", run, "record.jsonl"));
  expect(record).toContainEqual(expect.objectContaining({ event: "run_start", model_source: "scripted" }));
  expect(record).toContainEqual(expect.objectContaining({ event: "check", check: "gate", exit: 0 }));
  expect(record.filter((event) => event["event"] === "stage_end").map((event) => event["stage"]))
    .toEqual(["01-draft", "02-report"]);
});

test("--script without its response file says to supply a script", async () => {
  const { root, home } = await roots.scratch("bot-scripted-model-missing-");
  await assembly(home);
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, [], stderr);

  await expect(main(["run", "start", "review/main", "the request", "--script"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toMatch(/supply.*script|script.*supply/isu);
});
