// Ticket 0111: a subflow is a separate procedure. Its stage receives that
// flow's procedure, never the calling flow's, and an empty child body stays
// silent rather than falling back to the caller. The real provider boundary is
// the prompt seam the agent actually receives.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { callsSubflow, queue, realBoundary, router, tempRoots, writes, type Seen } from "./cli-boundary.ts";

const { scratch, cleanup } = tempRoots();
afterEach(async () => { await cleanup(); });

const PARENT_PROCEDURE = "Compare each cobalt claim before requesting an oracle answer.";
const CHILD_PROCEDURE = "Answer the delegated cobalt question before returning the finding.";
const PARENT = "Delegate the cobalt question to the oracle.";
const CHILD = "Answer the delegated cobalt question.";

async function assembly(home: string, childBody: string): Promise<void> {
  const root = join(home, "assemblies/review");
  await Promise.all([
    mkdir(join(root, "flows/main"), { recursive: true }),
    mkdir(join(root, "flows/main/subflows/oracle"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview cobalt claims.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), `---\ndescription: review cobalt claims\n---\n${PARENT_PROCEDURE}\n`),
    writeFile(join(root, "flows/main/01-delegate.md"), `---\n---\n${PARENT}\n`),
    writeFile(join(root, "flows/main/subflows/oracle/FLOW.md"), `---\ndescription: answer one cobalt question\n---\n${childBody}`),
    writeFile(join(root, "flows/main/subflows/oracle/01-answer.md"), `---\n---\n${CHILD}\n`),
  ]);
}

async function run(home: string, root: string): Promise<Seen[]> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  const seen: Seen[] = [];
  queue(faux, router({
    [PARENT]: (round) => {
      if (round === 1) return callsSubflow([{ flow: "oracle", input: "Is this cobalt claim sound?" }]);
      if (round === 2) return writes("$OUTPUT", "parent finding");
      return fauxAssistantMessage("done");
    },
    [CHILD]: (round) => round === 1 ? writes("$OUTPUT", "oracle finding") : fauxAssistantMessage("done"),
  }, seen), 8);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("parent finding");
  return seen;
}

function childPrompts(seen: readonly Seen[]): string[] {
  const prompts = seen.filter((call) => call.systemPrompt.includes(CHILD)).map((call) => call.systemPrompt);
  expect(prompts).not.toHaveLength(0);
  return prompts;
}

test("a descendant-flow stage receives its own procedure and static position, not its caller's procedure", async () => {
  const { root, home } = await scratch("bot-prompt-descendant-");
  await assembly(home, `${CHILD_PROCEDURE}\n`);

  for (const prompt of childPrompts(await run(home, root))) {
    expect(prompt).toContain(CHILD_PROCEDURE);
    expect(prompt).toContain("Step 1 of 1.");
    expect(prompt).not.toContain(PARENT_PROCEDURE);
  }
});

test("an empty descendant FLOW.md body contributes no procedure instead of inheriting its caller's", async () => {
  const { root, home } = await scratch("bot-empty-prompt-descendant-");
  await assembly(home, "\n");

  for (const prompt of childPrompts(await run(home, root))) {
    expect(prompt).not.toContain("# Procedure");
    expect(prompt).not.toContain(PARENT_PROCEDURE);
  }
});
