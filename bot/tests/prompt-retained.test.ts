// Ticket 0118 — the rendered prompt is retained, from ADR 0016 step 7 (which
// supersedes ADR 0012's "the record does not store the prompt: it is
// reconstructible"). Both halves of that consequence were false: the session
// keeps no system prompt, and `local-context: use` injects workspace bytes that
// are in no assembly — so no capture, however perfect, could answer "what was
// the model asked".
//
// The seam is the one cli-scratch-session-prompt (0052) and cli-local-context
// (0055) already use: a faux response factory is handed the Context the REAL
// runner built, so `context.systemPrompt` and `context.messages` ARE what the
// provider was sent. This file compares the retained FILE to that, byte for
// byte, which is the only assertion that can tell retention from a second
// rendering.
//
// The assertion sources, all in specification/elements:
// - record.md "What is kept beside it": the repeat level, and the rendered
//   prompt sitting there beside the session.
// - record.md "What a record answers" item 6: what the model was asked.
// - session.md "What a runtime must do with a session": the session is the
//   runtime's own format and holds no system prompt.
// - prompt.md "What the agent is told" and ADR 0012's layout, unmoved.
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

function at<Item>(items: readonly Item[], index: number): Item {
  const held = items[index];
  if (held === undefined) throw new Error(`nothing at index ${String(index)}`);
  return held;
}

// The distinctive sentences. WORKSPACE is the one that matters most: under
// `local-context: use` its bytes enter the system prompt from a tree that is in
// no assembly, no capture and no session.
const PURPOSE = "This assembly audits ledgers with a peculiar marmot rigour.";
const INSTRUCTION = "Weigh the quartz before signing the marmot ledger.";
const WORKSPACE = "In this tree the ledgers are kept in fathoms, never in cubits.";

interface Seen { systemPrompt: string; first: string }

async function assembly(home: string, flowKeys: string, gate?: string): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), `---\nintelligence: default\n---\n${PURPOSE}\n`),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), `---\ndescription: main flow\n${flowKeys}---\n`),
    writeFile(join(stage, "STAGE.md"), `---\n---\n${INSTRUCTION}\n`),
    ...(gate === undefined ? [] : [writeFile(join(stage, "gate"), gate)]),
  ]);
  if (gate !== undefined) await chmod(join(stage, "gate"), 0o755);
}

/** The first user turn as the provider received it: one text block, unescaped. */
function firstTurn(messages: readonly unknown[]): string {
  const message = at(messages, 0) as { content: { type: string; text?: string }[] };
  const block = at(message.content, 0);
  return block.text ?? "";
}

type Reply = ReturnType<typeof fauxAssistantMessage>;

/** The turn that satisfies a work stage: write `$OUTPUT`, then stop. */
function writes(): Reply[] {
  return [
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "the work" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ];
}

async function runOnce(root: string, home: string, argv: string[], replies: Reply[]): Promise<{ run: string; seen: Seen[] }> {
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
  const seen: Seen[] = [];
  const spy = (message: ReturnType<typeof fauxAssistantMessage>) => (context: { systemPrompt?: string; messages: unknown[] }) => {
    seen.push({ systemPrompt: context.systemPrompt ?? "", first: firstTurn(context.messages) });
    return message;
  };
  faux.setResponses(replies.map((reply) => spy(reply)));
  const code = await main(argv, held);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(code).toBe(0);
  return { run: at(await readdir(join(home, "runs")), 0), seen };
}

/** Every regular file in the run directory, as record-relative paths. */
async function runFiles(directory: string, prefix = ""): Promise<string[]> {
  const held: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) held.push(...await runFiles(join(directory, entry.name), `${path}/`));
    else held.push(path);
  }
  return held.sort();
}

// The whole ticket, in one run. The workspace document is the sharpest case:
// `local-context: use` puts a stranger's bytes in the system prompt, and before
// this ticket the run directory could not show them at all.
test("the rendered prompt is retained beside the session: the retained bytes ARE what the harness received, and no other file in the run holds them", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-prompt-retained-"));
  roots.push(root);
  const home = join(root, "home");
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  await assembly(home, "local-context: use\n");
  await writeFile(join(workspace, "AGENTS.md"), `${WORKSPACE}\n`);

  const ran = await runOnce(root, home, ["run", "start", "review/main", "--in", "workspace", "the request"], writes());
  const repeat = join(home, "runs", ran.run, "stages/01-work/1");

  // handed === retained, both halves, byte for byte. Buffer.compare over the
  // file's own bytes: a second rendering that agreed everywhere but one
  // trailing newline would fail here.
  const handed = at(ran.seen, 0);
  expect(Buffer.compare(await readFile(join(repeat, "system.txt")), Buffer.from(handed.systemPrompt))).toBe(0);
  expect(Buffer.compare(await readFile(join(repeat, "first-turn.txt")), Buffer.from(handed.first))).toBe(0);

  // The retained system prompt really carries what no capture could: the
  // workspace's own sentence, from a tree the run never copied (ADR 0016 §5).
  expect(handed.systemPrompt).toContain(`# Workspace\n\n${WORKSPACE}`);
  expect(handed.systemPrompt).toContain(`# Purpose\n\n${PURPOSE}`);
  expect(handed.systemPrompt).toContain(`# Instructions\n\n${INSTRUCTION}`);
  expect(handed.first).toContain("The files in `$INPUT` are:\n- `request.txt`");

  // record.md's layout: the prompt sits at the REPEAT level, beside the
  // session, and the attempt directory beneath it holds no prompt of its own.
  await expect(readdir(repeat)).resolves.toEqual(["1", "first-turn.txt", "session.jsonl", "system.txt"]);
  await expect(readdir(join(repeat, "1"))).resolves.toEqual(["checks", "output.txt"]);

  // And these two files are the ONLY place the run holds those bytes — which is
  // what main had none of. The session keeps the first turn escaped inside the
  // agent library's own JSONL and the system prompt not at all, so before this
  // ticket both sweeps came back empty.
  const directory = join(home, "runs", ran.run);
  const elsewhere = (await runFiles(directory)).filter((path) => !path.startsWith("stages/01-work/1/system") && !path.startsWith("stages/01-work/1/first-turn"));
  expect(elsewhere).toContain("stages/01-work/1/session.jsonl");
  expect(elsewhere).toContain("assembly/ASSEMBLY.md");
  for (const path of elsewhere) {
    const bytes = await readFile(join(directory, ...path.split("/")), "utf8");
    expect(bytes.includes(handed.systemPrompt), `${path} holds the system prompt`).toBe(false);
    expect(bytes.includes(handed.first), `${path} holds the first turn`).toBe(false);
    expect(bytes.includes(WORKSPACE), `${path} holds the workspace's bytes`).toBe(false);
  }
});

// The other half of the ticket: what the session already holds is not written
// down twice. A gate that says no once takes the stage to a second round in the
// same session — one more user turn, no second prompt file — and the retained
// system prompt is the stable prefix both rounds were sent (CHECKLIST 16).
test("a send-back round is the session's to hold: one retained prompt per repeat, and it is the prefix every round was sent", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-prompt-retained-sendback-"));
  roots.push(root);
  const home = join(root, "home");
  const once = join(root, "gate-ran-once");
  await assembly(home, "", `#!/bin/sh\nif [ -f '${once}' ]; then exit 0; fi\n: > '${once}'\necho 'the gate says no this once'\nexit 1\n`);

  const ran = await runOnce(root, home, ["run", "start", "review/main", "the request"], [...writes(), fauxAssistantMessage("second round")]);
  expect(ran.seen).toHaveLength(3);
  const repeat = join(home, "runs", ran.run, "stages/01-work/1");

  // Two attempts really ran, in one session, and the repeat directory gained
  // exactly one system.txt and one first-turn.txt for the pair.
  await expect(readdir(repeat)).resolves.toEqual(["1", "2", "first-turn.txt", "session.jsonl", "system.txt"]);
  await expect(readdir(join(repeat, "2"))).resolves.toEqual(["checks", "output.txt"]);

  // ADR 0012's stable prefix, now witnessed against a file rather than only
  // against the provider's two views of it: the retained bytes are what round 1
  // and round 3 were both sent.
  const system = await readFile(join(repeat, "system.txt"));
  expect(Buffer.compare(system, Buffer.from(at(ran.seen, 0).systemPrompt))).toBe(0);
  expect(Buffer.compare(system, Buffer.from(at(ran.seen, 2).systemPrompt))).toBe(0);

  // The send-back is in the session and nowhere else: retained is the FIRST
  // turn, not the last one the agent read.
  const first = await readFile(join(repeat, "first-turn.txt"), "utf8");
  expect(first).not.toContain("the gate says no this once");
  expect(await readFile(join(repeat, "session.jsonl"), "utf8")).toContain("the gate says no this once");
});

// The other round the session already holds: a LOOP's question, which arrives
// after the work has passed (loop.md). Two repeats also witness the placement:
// the prompt is built once per stage-repeat (ADR 0012), so a stage that ran
// twice keeps a pair under each repeat rather than one for the pair of them.
test("a loop's question is the session's too: each repeat keeps its own pair, and neither holds the question", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-prompt-retained-loop-"));
  roots.push(root);
  const home = join(root, "home");
  const question = "Is the ledger complete?";
  const cycle = join(home, "assemblies/review/flows/main/01-cycle");
  await assembly(home, "");
  await mkdir(join(cycle, "01-work"), { recursive: true });
  await Promise.all([
    rm(join(home, "assemblies/review/flows/main/01-work"), { recursive: true }),
    writeFile(join(cycle, "LOOP.md"), `---\nrepeat: 2\n---\n${question}\n`),
    writeFile(join(cycle, "01-work/STAGE.md"), `---\n---\n${INSTRUCTION}\n`),
    // A sequence ends with a stage, never a container (flow.md), so the loop
    // gets a tail — one more stage-repeat, retained like the rest.
    writeFile(join(home, "assemblies/review/flows/main/02-tail.md"), `---\n---\n${INSTRUCTION}\n`),
  ]);

  const answer = (held: "continue" | "stop"): Reply =>
    fauxAssistantMessage([fauxToolCall("continue", { answer: held, reason: "the ledger says so" })], { stopReason: "toolUse" });
  const ran = await runOnce(root, home, ["run", "start", "review/main", "the request"], [
    ...writes(), answer("continue"), // repeat 1: the work passes, then the question
    ...writes(), answer("stop"), // repeat 2, which ends the loop
    ...writes(), // the tail
  ]);

  for (const held of ["1", "2"]) {
    const repeat = join(home, "runs", ran.run, "stages/01-cycle/01-work", held);
    await expect(readdir(repeat)).resolves.toEqual(["1", "first-turn.txt", "session.jsonl", "system.txt"]);
    const first = await readFile(join(repeat, "first-turn.txt"), "utf8");
    expect(first).not.toContain(question);
    expect(await readFile(join(repeat, "system.txt"), "utf8")).not.toContain(question);
    expect(await readFile(join(repeat, "session.jsonl"), "utf8")).toContain(question);
  }
  // Each repeat's retained system prompt is that repeat's own — round 1 opened
  // repeat 1, round 4 opened repeat 2.
  const bytes = async (held: string): Promise<Buffer> => readFile(join(home, "runs", ran.run, "stages/01-cycle/01-work", held, "system.txt"));
  expect(Buffer.compare(await bytes("1"), Buffer.from(at(ran.seen, 0).systemPrompt))).toBe(0);
  expect(Buffer.compare(await bytes("2"), Buffer.from(at(ran.seen, 3).systemPrompt))).toBe(0);
});
