import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { continuationFor, type ResumeDonor } from "../src/continuation.ts";
import type { Flow, StageNode } from "../src/model.ts";
import { hashBytes } from "../src/record.ts";
import { tempRoots } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

function stage(name: string, path: string, extension: StageNode["extension"] = "txt"): StageNode {
  return { kind: "STAGE", name, path, options: {}, files: [`${path}.md`], extension, skills: [], subflows: new Map(), body: `${name}.` };
}

function flow(nodes: StageNode[]): Flow {
  return { name: "main", path: "flows/main", options: {}, skills: [], subflows: new Map(), sequence: { path: "flows/main", nodes } };
}

function donor(events: Record<string, unknown>[], directory = "/unused"): ResumeDonor {
  return {
    name: "2026-09-05T13-00-00-test", directory, assembly: "review", assemblyHash: "a".repeat(64), flow: "main",
    request: { bytes: Buffer.from("request"), extension: "txt", via: "argument" }, events,
  };
}

test("missing reasons stay explicit and disagreeing, signalled, or unrelated endings add no evidence", async () => {
  const stageEnd = { event: "stage_end", stage: "01-plan", retry: 1, exit: 2, cause: "fault" };
  const runEnd = { event: "run_end", exit: 2, cause: "fault" };
  const matching = await continuationFor(donor([stageEnd, runEnd]), flow([stage("plan", "01-plan")]));
  if ("code" in matching) throw new Error("Fixture continuation refused.");
  expect(JSON.parse(matching.failure?.bytes.toString() ?? "") as unknown).toMatchObject({
    kind: "bot.resume-prior-failure", reason: null, reason_bytes: 0, reason_truncated: false,
  });

  const cases = [
    [{ ...stageEnd, exit: 0, cause: "success" }, { ...runEnd, exit: 0, cause: "success" }],
    [stageEnd, { ...runEnd, cause: "timeout" }],
    [{ ...stageEnd, exit: 143, cause: "signal" }, { ...runEnd, exit: 143, cause: "signal" }],
    [{ ...stageEnd, stage: "02-other" }, runEnd],
    [stageEnd, { ...runEnd, stage: "02-other", retry: 1 }],
  ];
  for (const events of cases) {
    const held = await continuationFor(donor(events), flow([stage("plan", "01-plan")]));
    if ("code" in held) throw new Error("Fixture continuation refused.");
    expect(held.failure).toBeUndefined();
  }
});

test("prior-failure evidence takes the first deterministic name after an ordinary-source collision", async () => {
  const { root } = await roots.scratch("bot-resume-failure-name-");
  const directory = join(root, "donor");
  const outputPath = "resume/bot-resume-prior-failure.json";
  const outputBytes = Buffer.from("ordinary source\n");
  await mkdir(join(directory, "resume"), { recursive: true });
  await writeFile(join(directory, outputPath), outputBytes);
  const held = await continuationFor(donor([
    { event: "stage_end", stage: "01-source", retry: 1, exit: 0, cause: "success", sealed: true, judged: true,
      output: { path: outputPath, sha256: hashBytes(outputBytes) } },
    { event: "stage_end", stage: "02-code", retry: 1, exit: 2, cause: "fault", reason: "full" },
    { event: "run_end", stage: "02-code", retry: 1, exit: 2, cause: "fault" },
  ], directory), flow([stage("source", "01-source"), stage("code", "02-code")]));
  if ("code" in held) throw new Error("Fixture continuation refused.");
  expect(held.sources.map(({ name, extension }) => `${name}.${extension}`)).toEqual(["source.txt"]);
  expect(held.failure?.name).toBe("bot-resume-prior-failure-2");
});
