// Ticket 0110: 0093 proved a flow procedure only for a flat sequence. These
// runs put the prompt seam through each position where graph traversal is not
// a linear stage index: a folder stage, both PARALLEL branches, a selected
// CHOOSE alternative, and repeated LOOP work. The assertions read the system
// prompt the real runner hands the provider, not an internal graph helper.
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { queue, realBoundary, router, tempRoots, writes, type Seen } from "./cli-boundary.ts";

const { scratch, cleanup } = tempRoots();
afterEach(async () => { await cleanup(); });

const PROCEDURE = "Compare every quartz claim before filing the marmot report.";
const FOLDER = "Foldermarker: prepare the quartz.";
const ALPHA = "Alphamarker: inspect one quartz face.";
const BETA = "Betamarker: inspect the other quartz face.";
const SELECT = "Select the safer quartz action.";
const PATCH = "Patchmarker: make the selected quartz repair.";
const REJECT = "Rejectmarker: this alternative must not run.";
const CYCLE = "Cyclemarker: polish the quartz report.";
const TAIL = "Tailmarker: publish the quartz report.";

async function compositeAssembly(home: string, body: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await Promise.all([
    mkdir(join(flow, "01-package"), { recursive: true }),
    mkdir(join(flow, "02-fan"), { recursive: true }),
    mkdir(join(flow, "03-decide"), { recursive: true }),
    mkdir(join(flow, "04-polish"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview quartz claims.\n"),
    writeFile(join(flow, "FLOW.md"), `---\ndescription: review quartz claims\n---\n${body}`),
    writeFile(join(flow, "01-package/STAGE.md"), `---\n---\n${FOLDER}\n`),
    writeFile(join(flow, "02-fan/PARALLEL.md"), "---\nwidth: 1\n---\n"),
    writeFile(join(flow, "02-fan/alpha.md"), `---\n---\n${ALPHA}\n`),
    writeFile(join(flow, "02-fan/beta.md"), `---\n---\n${BETA}\n`),
    writeFile(join(flow, "03-decide/CHOOSE.md"), `---\n---\n${SELECT}\n\n- \`patch\` — repair the claim\n- \`reject\` — discard the claim\n`),
    writeFile(join(flow, "03-decide/patch.md"), `---\n---\n${PATCH}\n`),
    writeFile(join(flow, "03-decide/reject.md"), `---\n---\n${REJECT}\n`),
    writeFile(join(flow, "04-polish/LOOP.md"), "---\nrepeat: 2\n---\n"),
    writeFile(join(flow, "04-polish/01-work.md"), `---\n---\n${CYCLE}\n`),
    writeFile(join(flow, "05-publish.md"), `---\n---\n${TAIL}\n`),
  ]);
}

function complete(marker: string) {
  return (round: number) => round % 2 === 1
    ? writes("$OUTPUT", `${marker} complete`)
    : fauxAssistantMessage("done");
}

async function runComposite(home: string, root: string): Promise<Seen[]> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  const seen: Seen[] = [];
  queue(faux, router({
    [FOLDER]: complete(FOLDER),
    [ALPHA]: complete(ALPHA),
    [BETA]: complete(BETA),
    [SELECT]: () => fauxAssistantMessage([fauxToolCall("select", { name: "patch", reason: "the repair is safe" })], { stopReason: "toolUse" }),
    [PATCH]: complete(PATCH),
    [REJECT]: () => { throw new Error("the declined alternative ran"); },
    [CYCLE]: complete(CYCLE),
    [TAIL]: complete(TAIL),
  }, seen), 15);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe(`${TAIL} complete`);
  return seen;
}

function promptsFor(seen: readonly Seen[], marker: string): string[] {
  const prompts = seen.filter((call) => call.systemPrompt.includes(marker)).map((call) => call.systemPrompt);
  expect(prompts).not.toHaveLength(0);
  return prompts;
}

function procedure(prompt: string): string {
  const held = /^# Procedure\n\n([\s\S]*?)(?=\n# )/mu.exec(prompt)?.[1];
  expect(held).toBeDefined();
  return held ?? "";
}

function expectPosition(prompt: string, terms: readonly string[], numbers: readonly number[]): void {
  const held = procedure(prompt);
  expect(held).toContain(PROCEDURE);
  for (const term of terms) expect(held).toMatch(new RegExp(`\\b${term}\\b`, "iu"));
  for (const number of numbers) expect(held).toMatch(new RegExp(`\\b${String(number)}\\b`, "u"));
}

test("a flow procedure reaches composite-stage prompts with their static structure, never a fabricated linear or repeat position", async () => {
  const { root, home } = await scratch("bot-prompt-composites-");
  await compositeAssembly(home, `${PROCEDURE}\n`);
  const seen = await runComposite(home, root);

  // The folder-form stage is the first of the flow's five authored entries.
  expectPosition(promptsFor(seen, FOLDER)[0] ?? "", [], [1, 5]);

  // Parallel work is identified as a branch of the parallel step rather than
  // as a made-up member of one sequential execution.
  expectPosition(promptsFor(seen, ALPHA)[0] ?? "", ["parallel", "branch", "alpha"], [2, 5]);
  expectPosition(promptsFor(seen, BETA)[0] ?? "", ["parallel", "branch", "beta"], [2, 5]);

  // The selected choice alternative identifies both its alternative and the
  // choice that owns it. The unselected alternative never reaches a provider.
  expectPosition(promptsFor(seen, PATCH)[0] ?? "", ["choice", "alternative", "patch"], [3, 5]);
  expect(seen.filter((call) => call.systemPrompt.includes(REJECT))).toEqual([]);

  // A loop's prompt names its static loop position. Both repeats receive the
  // same procedure section, so it cannot claim a changing linear position or
  // disclose how many repeats remain.
  const repeated = promptsFor(seen, CYCLE);
  for (const prompt of repeated) expectPosition(prompt, ["loop"], [4, 5]);
  const firstProcedure = procedure(repeated[0] ?? "");
  for (const prompt of repeated.slice(1)) expect(procedure(prompt)).toBe(firstProcedure);
});

test("an empty FLOW.md body remains silent at every composite-stage prompt", async () => {
  const { root, home } = await scratch("bot-empty-prompt-composites-");
  await compositeAssembly(home, "\n");
  const seen = await runComposite(home, root);

  for (const marker of [FOLDER, ALPHA, BETA, PATCH, CYCLE, TAIL]) {
    for (const prompt of promptsFor(seen, marker)) expect(prompt).not.toContain("# Procedure");
  }
  expect(seen.filter((call) => call.systemPrompt.includes(REJECT))).toEqual([]);
});
