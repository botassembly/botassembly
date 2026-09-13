// Ticket 0061 — invariants 1-6 and 37, screened against what a REAL run sends
// a model, not against a fixture.
//
// prompt.test.ts's "no golden discloses hidden runtime facts" screens the
// checked-in goldens, which are `buildSystemPrompt`/`buildInitialPrompt` output
// for hand-written PromptSystem values. That catches an unconditional edit to
// either builder and nothing else. The walk demonstrated the hole: with one
// extra optional parameter threaded from the runtime's own call site, every
// live prompt could carry
//
//   "You are stage 01-work of flow main in the assembly at /home/…, running on
//    model faux-1 at reasoning high with 2 retries left and a 3600s timeout;
//    the gate that will judge you is /home/…/gate, and the run record is under
//    BOT_HOME at /home/…/runs."
//
// and all 342 tests plus all 89 corpus cases stayed green. This test closes
// that: it drives a real run through main() with the faux provider, keeps every
// system prompt and every message the provider was handed, and screens them.
//
// The fixture's authored words are controlled on purpose. A word screen cannot
// be applied to arbitrary authored prose — an ASSEMBLY.md body is free to say
// "this assembly", and its body is supposed to reach the prompt whole (prompt.md)
// — so nothing this fixture authors uses a screened word, and every screened
// word that appears would therefore be the runtime's own.
//
// The assertion sources:
// - invariants.md 1-6: where the assembly is, where the record is, that a gate
//   exists or what it checks, the provider/model/reasoning/timeout/retries,
//   which repeat of a loop it is in, and "that any of this exists".
// - invariants.md 37: "The agent is not handed a map to the machinery judging
//   it."
// - runtime.md "What the runtime knows and the agent does not": "It is not told
//   where the assembly lives, where the record lives, where its scratch really
//   is, or where anything checking it lives. It is not told its provider, its
//   model, its timeout, or how many retries remain."
// - slots.md: scratch "sits in a cache directory the runtime owns … so no slot
//   value discloses where runs live".
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

// Word-controlled authored text: no screened word appears in any of it, so a
// screened word in a live prompt can only have come from the runtime.
const PURPOSE = "Turn the supplied material into a careful, sourced answer.";
const INSTRUCTION = "Read what you were given and write the result.";
const QUESTION = "Is the draft accurate and complete?";
const REFUSED = "Add the missing citation and try once more.";

// The same list prompt.test.ts screens the goldens with, plus the two facts it
// does not name: which repeat of a loop the agent is in (invariant 5) and how
// long it has (invariant 4's `timeout`).
const FORBIDDEN = [
  /\/(?:home|Users)\//iu,
  /\bgates?\b/iu,
  /\b(?:provider|model|openai|anthropic|claude|gpt|gemini|intelligence)\b/iu,
  /\b(?:retry|retries|attempts?|rounds?)\b/iu,
  /\b(?:assembly|assemblies|flow|flows|stage|stages)\b/iu,
  /\bBOT_HOME\b/iu,
  /\.local\/share\/bot\b/iu,
  /\b(?:repeat|repeats|repetition|loop|loops|iteration)\b/iu,
  /\b(?:timeout|deadline|budget)\b/iu,
];

// A one-stage flow inside a LOOP with two repeats, holding a gate that says no
// on its first call: every hidden fact this invariant block names has something
// concrete to be disclosed about — a repeat number, a gate and its verdict, a
// model, a reasoning level, a timeout, and four absolute paths.
async function assembly(home: string, gate: string): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-cycle/01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  worker:\n    provider: faux\n    model: faux-1\n    reasoning: xhigh\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), `---\nintelligence: worker\n---\n${PURPOSE}\n`),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: the main one\n---\n"),
    writeFile(join(home, "assemblies/review/flows/main/01-cycle/LOOP.md"), `---\nrepeat: 2\n---\n${QUESTION}\n`),
    writeFile(join(home, "assemblies/review/flows/main/02-tail.md"), `---\n---\n${INSTRUCTION}\n`),
    writeFile(join(stage, "STAGE.md"), `---\n---\n${INSTRUCTION}\n`),
    writeFile(join(stage, "gate"), gate),
  ]);
  await chmod(join(stage, "gate"), 0o755);
}

test("invariants 1-6 and 37: nothing a real run sends a model names the machinery around it", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-live-prompt-"));
  roots.push(root);
  const home = join(root, "home");
  const cache = join(root, "cache");
  const once = join(root, "gate-said-no-once");
  // The gate says no on its first call, so a send-back happens and the reason
  // the agent is given is screened too (gate.md: the failing gate's output "is
  // put into the agent's session as the reason it cannot leave yet").
  await assembly(home, `#!/bin/sh\nif [ -f '${once}' ]; then exit 0; fi\n: > '${once}'\necho '${REFUSED}'\nexit 1\n`);

  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const held: CliBoundary = {
    cwd: root,
    env: { ...process.env, BOT_HOME: home, PWD: root, XDG_CACHE_HOME: cache },
    stdinIsTTY: true,
    stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { stdout.push(Buffer.from(bytes)); },
    stderr: (bytes) => { stderr.push(Buffer.from(bytes)); },
    clock,
    models,
  };

  // Everything the provider was handed, kept: the system prompt and the whole
  // message list, which is the only honest view of what the model was told
  // (cli-scratch-session-prompt, 0052 — nothing durable on disk holds the
  // system prompt).
  // What is screened is what the RUNTIME composes: the system prompt, and the
  // user-role messages, which are the initial prompt, every send-back reason,
  // and a loop's question. A `toolResult` message is the agent's own action
  // echoed back by the tool that ran it, and Pi's `write` tool echoes the
  // absolute path it wrote to — see the finding in ticket 0061's report; that
  // is a real disclosure and a real ticket, but it is not this prompt's bytes
  // and papering it into this screen would only make the screen unrunnable.
  interface Part { type: string; text?: string }
  interface Message { role: string; content: string | Part[] }
  const flatten = (content: string | Part[]): string =>
    typeof content === "string" ? content : content.map((part) => part.text ?? "").join("\n");
  const seen: string[] = [];
  const spy = (message: ReturnType<typeof fauxAssistantMessage>) =>
    (context: { systemPrompt?: string; messages: unknown[] }) => {
      seen.push(context.systemPrompt ?? "");
      for (const held of context.messages as Message[]) {
        if (held.role === "user") seen.push(flatten(held.content));
      }
      return message;
    };
  const writes = () => [
    spy(fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "the draft" })], { stopReason: "toolUse" })),
    spy(fauxAssistantMessage("finished")),
  ];
  const answers = () => [spy(fauxAssistantMessage([fauxToolCall("continue", { answer: "continue", reason: "more to do" })], { stopReason: "toolUse" }))];
  const stops = () => [spy(fauxAssistantMessage([fauxToolCall("continue", { answer: "stop", reason: "it reads well" })], { stopReason: "toolUse" }))];
  faux.setResponses([
    ...writes(), spy(fauxAssistantMessage("nothing changed")), ...answers(), // repeat 1: gate says no, then yes, then continue
    ...writes(), ...stops(), // repeat 2
    ...writes(), // the tail
  ]);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  // The run really reached the second repeat and really used the gate, so the
  // facts under test existed to be disclosed — a screen over a run that never
  // looped and never gated would pass vacuously.
  const run = at((await readdir(join(home, "runs"))).filter((entry) => !entry.endsWith(".lock")), 0);
  const events = (await readFile(join(home, "runs", run, "record.jsonl"), "utf8")).trimEnd()
    .split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(events.filter((event) => event["event"] === "check" && event["check"] === "gate")
    .map((event) => [event["repeat"], event["retry"], event["exit"]]))
    .toEqual([[1, 1, 1], [1, 2, 0], [2, 1, 0]]);
  expect(events).toContainEqual(expect.objectContaining({ event: "loop_done", repeats: 2, ended_by: "stop" }));
  expect(events.some((event) => event["event"] === "stage_start"
    && JSON.stringify(event["options"]).includes('"name":"intelligence","value":"worker"'))).toBe(true);
  expect(seen.join("\n")).not.toMatch(/\bworker\b/u);
  // And the screen really had prompts to read: a system prompt and at least one
  // user message per model call, across both repeats and the tail.
  expect(seen.length).toBeGreaterThan(12);

  // The paths. These cannot be confounded by authored prose: each is an
  // absolute path this test minted, and none of them is a slot's NAME — the
  // prompt is expected to name `$INPUT`, `$OUTPUT`, `$TMP`, `$SKILLS`, `$PWD`
  // and never their values, except `$PWD`'s, which the caller chose.
  const secrets: Record<string, string> = {
    "the home": home,
    "the run directory": join(home, "runs", run),
    "the assembly root": join(home, "assemblies/review"),
    "the scratch root": cache,
    "the model id": "faux-1",
    "the reasoning level": "xhigh",
    "the timeout": "3600",
  };
  for (const [label, secret] of Object.entries(secrets)) {
    for (const [index, text] of seen.entries()) {
      expect(text, `prompt ${String(index)} names ${label}`).not.toContain(secret);
    }
  }

  // And the words. Every one of them would be the runtime's, because nothing
  // this fixture authors uses any of them.
  for (const [index, text] of seen.entries()) {
    for (const pattern of FORBIDDEN) {
      expect(text, `prompt ${String(index)} matches ${String(pattern)}`).not.toMatch(pattern);
    }
  }
});
