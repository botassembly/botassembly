// Ticket 0063 item 5 — the POSITIVE half of the prompt screen. Its twin,
// runtime-prompt-disclosure.test.ts, proves the runtime tells the agent nothing
// it should not. Nothing proved it tells the agent what it SHOULD, on the leg
// between `bot check` (whose `skills` field is pinned) and $SKILLS
// materialization (also pinned): the system prompt itself.
//
// 0064's audit made the hole concrete by making `promptSkills` return `[]` with
// the whole gate still green. That particular hole is now closed — 0055's
// cli-local-context legs assert the skill bullet — but the same falsification
// applied to the other announced elements found two still open on 2026-08-03:
// dropping the assembly's declared SLOTS and dropping the SUBFLOW names each
// left all 349 tests and all 89 corpus cases passing.
//
// One containment assertion per announced element, through the honest seam: the
// Context the real runner handed the provider (the cli-stage-options idiom,
// 0041). No golden snapshots — a golden pins bytes, and what is under test here
// is that the authored fact ARRIVED, not how it is spelled.
//
// The assertion sources, all in specification/elements:
// - prompt.md "What the agent is told": the purpose, the slot list, each skill
//   and subflow by name and one line, and the workspace bullet.
// - slots.md: a declared slot is announced as `$NAME` with its description.
// - skills.md / subflow.md "The three scopes": the agent is told each name and
//   its `description`, and nothing about where it came from.
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";

const roots: string[] = [];
const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// One distinctive sentence per announced element. Nothing else in the fixture
// holds any of them, so finding one in the system prompt can only mean that
// authored file's bytes reached it.
const PURPOSE = "This assembly settles ledger disputes with a peculiar marmot rigour.";
const PROCEDURE = "First weigh the quartz, then sign the marmot ledger.";
const INSTRUCTION = "Weigh the quartz before signing the marmot ledger.";
const FINAL_INSTRUCTION = "Sign the marmot ledger after weighing the quartz.";
const SLOT = "the fathom tables this work is answered from";
const SKILL = "keep the marmot house style";
const SUBFLOW = "think hard about one quartz question";
const WORKSPACE = "In this tree the ledgers are kept in fathoms, never in cubits.";

async function fixture(): Promise<{ root: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-prompt-announcement-"));
  roots.push(root);
  const home = join(root, "home");
  const assembly = join(home, "assemblies/review");
  await mkdir(join(assembly, "flows/main"), { recursive: true });
  await mkdir(join(assembly, "skills/house-style"), { recursive: true });
  await mkdir(join(assembly, "subflows/oracle"), { recursive: true });
  await mkdir(join(root, "workspace"), { recursive: true });
  await mkdir(join(root, "tables"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(assembly, "ASSEMBLY.md"), `---\nintelligence: default\nslots:\n  kb: ${SLOT}\n---\n${PURPOSE}\n`),
    writeFile(join(assembly, "flows/main/FLOW.md"), `---\ndescription: main flow\n---\n${PROCEDURE}\n`),
    writeFile(join(assembly, "flows/main/01-work.md"), `---\n---\n${INSTRUCTION}\n`),
    writeFile(join(assembly, "flows/main/02-finish.md"), `---\n---\n${FINAL_INSTRUCTION}\n`),
    writeFile(join(assembly, "skills/house-style/SKILL.md"), `---\ndescription: ${SKILL}\n---\nBody.\n`),
    writeFile(join(assembly, "subflows/oracle/FLOW.md"), `---\ndescription: ${SUBFLOW}\n---\n`),
    writeFile(join(assembly, "subflows/oracle/01-think.md"), "---\n---\nThink.\n"),
    writeFile(join(root, "workspace/AGENTS.md"), `${WORKSPACE}\n`),
    writeFile(join(root, "tables/fathoms.md"), "Fathoms.\n"),
  ]);
  return { root, home };
}

test("every element prompt.md says is announced reaches the system prompt of a real run", async () => {
  const { root, home } = await fixture();
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const stderr: Buffer[] = [];
  const held: CliBoundary = {
    cwd: root,
    env: { ...process.env, BOT_HOME: home, PWD: root, XDG_CACHE_HOME: join(root, "cache") },
    stdinIsTTY: true,
    stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: () => undefined,
    stderr: (bytes) => { stderr.push(Buffer.from(bytes)); },
    clock,
    models,
  };
  const systems: string[] = [];
  const spy = (message: ReturnType<typeof fauxAssistantMessage>) => (context: { systemPrompt?: string }) => {
    systems.push(context.systemPrompt ?? "");
    return message;
  };
  faux.setResponses([
    spy(fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "the ruling" })], { stopReason: "toolUse" })),
    spy(fauxAssistantMessage("done")),
    spy(fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "the conclusion" })], { stopReason: "toolUse" })),
    spy(fauxAssistantMessage("done")),
  ]);

  const argv = ["run", "start", "review/main", "--kb", "tables", "--in", "workspace", "--local-context", "announce", "the dispute"];
  await expect(main(argv, held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  const system = systems[0];
  if (system === undefined) throw new Error("the provider was never called");

  // The purpose is the assembly's body, whole (prompt.md: "the assembly frames").
  expect(system).toContain(`# Purpose\n\n${PURPOSE}`);
  // The flow's body gives each fresh context the procedure and its place in it.
  for (const prompt of systems) expect(prompt).toContain(PROCEDURE);
  const first = systems.filter((prompt) => prompt.includes(INSTRUCTION));
  const last = systems.filter((prompt) => prompt.includes(FINAL_INSTRUCTION));
  expect(first).not.toHaveLength(0);
  expect(last).not.toHaveLength(0);
  for (const prompt of first) {
    expect(prompt).toMatch(/\b1 of 2\b/u);
    expect(prompt).not.toMatch(/\b2 of 2\b/u);
  }
  for (const prompt of last) {
    expect(prompt).toMatch(/\b2 of 2\b/u);
    expect(prompt).not.toMatch(/\b1 of 2\b/u);
  }
  // The declared slot, by name and description, beside the built-in slots.
  expect(system).toContain(`- \`$KB\` — ${SLOT}`);
  expect(system).toContain("- `$INPUT` — a directory containing the named input files.");
  // Each skill: name, one line, and where to read the rest — progressive
  // disclosure's whole announcement (skills.md).
  expect(system).toContain(`- \`house-style\` — ${SKILL} Read \`$SKILLS/house-style/SKILL.md\` when useful.`);
  // Each subflow in scope: name and description, and nothing about its scope.
  expect(system).toContain(`- \`oracle\` — ${SUBFLOW}`);
  expect(system).toContain("- `$SUBFLOWS` — saved inputs and answers from helper calls.");
  expect(system).not.toContain("subflows/oracle");
  // The workspace, announced as one line and never injected (invocation.md).
  expect(system).toContain("- `AGENTS.md` — the workspace's own instructions for this tree. Read `$PWD/AGENTS.md` when useful.");
  expect(system).not.toContain(WORKSPACE);
  // The stage's own instruction, which is what all of the above frames.
  expect(system).toContain(INSTRUCTION);
});
