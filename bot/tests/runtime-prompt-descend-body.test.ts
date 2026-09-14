// Ticket 0282, contradiction C4: `DESCEND.md` stands in the place of
// `FLOW.md` and the flow is otherwise ordinary, so a descend flow's body is
// the procedure every stage inside it receives. The reader used to keep a body
// only from `FLOW.md`, so an authored `DESCEND.md` body reached no prompt at
// all. A whitespace-only body stays silent, exactly as a flow body does.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { callsSubflow, queue, realBoundary, router, tempRoots, writes, type Seen } from "./cli-boundary.ts";

const { scratch, cleanup } = tempRoots();
afterEach(async () => { await cleanup(); });

const DESCEND_PROCEDURE = "Split the cobalt question before answering any part of it.";
const PARENT = "Delegate the cobalt question to the oracle.";
const CHILD = "Answer the delegated cobalt question.";

async function assembly(home: string, descendBody: string): Promise<void> {
  const root = join(home, "assemblies/review");
  await mkdir(join(root, "flows/main/subflows/oracle"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview cobalt claims.\n"),
    writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: review cobalt claims\n---\n"),
    writeFile(join(root, "flows/main/01-delegate.md"), `---\n---\n${PARENT}\n`),
    writeFile(join(root, "flows/main/subflows/oracle/DESCEND.md"),
      `---\ndescription: answer one cobalt question\nmax-depth: 2\n---\n${descendBody}`),
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
  return seen;
}

function childPrompts(seen: readonly Seen[]): string[] {
  const prompts = seen.filter((call) => call.systemPrompt.includes(CHILD)).map((call) => call.systemPrompt);
  expect(prompts).not.toHaveLength(0);
  return prompts;
}

test("a DESCEND.md body is the procedure every stage inside that flow receives", async () => {
  const { root, home } = await scratch("bot-descend-body-");
  await assembly(home, `${DESCEND_PROCEDURE}\n`);

  for (const prompt of childPrompts(await run(home, root))) {
    expect(prompt).toContain("# Procedure");
    expect(prompt).toContain(DESCEND_PROCEDURE);
  }
});

test("a whitespace-only DESCEND.md body contributes no procedure", async () => {
  const { root, home } = await scratch("bot-descend-empty-body-");
  await assembly(home, "   \n\n");

  for (const prompt of childPrompts(await run(home, root))) {
    expect(prompt).not.toContain("# Procedure");
  }
});
