// Ticket 0066 — invariants 2, 5 and 6, screened against what the TOOLS say
// back to a model, not against what the runtime writes for it.
//
// The general lesson, and the reason this file exists next to
// runtime-prompt-disclosure.test.ts: a disclosure screen that covers only the
// channel we author is not a screen. The prompt was screened for a long time —
// goldens, then a live screen over every system prompt and user message — and
// all of it was true. Meanwhile every `write` handed the model
//
//   Successfully wrote 25 bytes to …/cache/bot/tmp/<run>/stages/02-decide/2/output.txt
//
// which names the scratch root, the run, the stage's path in the flow and the
// repeat, on every write of every run. The screened channel was the one we
// wrote; the leaking channel was the one we quoted. This test screens the
// quoted one.
//
// The assertion sources:
// - invariants.md 2: where the record and the scratch really live.
// - invariants.md 5: "which repeat of a loop it is in".
// - invariants.md 6: "that any of this exists" — assemblies, flows, stages.
// - slots.md: the agent addresses its ground by slot name, and a slot value
//   never discloses where runs live.
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
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

// Word-controlled authored text, the same discipline as the prompt screen: no
// screened word appears in anything this fixture writes or the agent writes,
// so a screened word in a tool result can only be the runtime's.
const PURPOSE = "Turn the supplied material into a careful, sourced answer.";
const INSTRUCTION = "Read what you were given and write the result.";
const QUESTION = "Is the draft accurate and complete?";
const DRAFT = "alpha beta\n";
const EDITED = "alpha gamma\n";
// Authored, so the shell leg's results can be told from the file tools' without
// reading either — nothing the runtime composes could produce this word.
const MARK = "ground-check";

const FORBIDDEN = [
  /\/(?:home|Users)\//iu,
  /\b(?:assembly|assemblies|flow|flows|subflow|subflows|stage|stages)\b/iu,
  /\b(?:repeat|repeats|repetition|loop|loops|iteration)\b/iu,
  /\bBOT_HOME\b/iu,
  /\.local\/share\/bot\b/iu,
];

async function assembly(home: string): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-cycle/01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n  hard: { provider: faux, model: faux-1, reasoning: xhigh }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), `---\nintelligence: default\n---\n${PURPOSE}\n`),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: the main one\n---\n"),
    writeFile(join(home, "assemblies/review/flows/main/01-cycle/LOOP.md"), `---\nrepeat: 2\n---\n${QUESTION}\n`),
    writeFile(join(home, "assemblies/review/flows/main/02-tail.md"), `---\n---\n${INSTRUCTION}\n`),
    writeFile(join(stage, "STAGE.md"), `---\n---\n${INSTRUCTION}\n`),
  ]);
}

test("invariants 2, 5 and 6: no tool result a real run hands a model names the runtime's ground", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-live-tools-"));
  roots.push(root);
  const sandboxRoots = [root, await realpath(root)];
  const withoutSandbox = (text: string): string =>
    sandboxRoots.reduce((clean, sandboxRoot) => clean.replaceAll(sandboxRoot, ""), text);
  const home = join(root, "home");
  const cache = join(root, "cache");
  await assembly(home);

  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const stderr: Buffer[] = [];
  const held: CliBoundary = {
    cwd: root,
    env: { ...process.env, BOT_HOME: home, PWD: root, XDG_CACHE_HOME: cache },
    stdinIsTTY: true,
    stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: () => undefined,
    stderr: (bytes) => { stderr.push(Buffer.from(bytes)); },
    clock,
    models,
  };

  // Everything the provider was handed, kept — but this time the `toolResult`
  // messages, which runtime-prompt-disclosure.test.ts deliberately excludes as
  // "the agent's own action echoed back". They are the agent's action echoed
  // back through OUR path resolution, and that is the leak.
  interface Part { type: string; text?: string }
  interface Message { role: string; content: string | Part[] }
  const flatten = (content: string | Part[]): string =>
    typeof content === "string" ? content : content.map((part) => part.text ?? "").join("\n");
  const results = new Set<string>();
  const spy = (message: ReturnType<typeof fauxAssistantMessage>) =>
    (context: { messages: unknown[] }) => {
      for (const seen of context.messages as Message[]) {
        if (seen.role === "toolResult") results.add(flatten(seen.content));
      }
      return message;
    };
  const call = (name: string, params: object) =>
    spy(fauxAssistantMessage([fauxToolCall(name, params)], { stopReason: "toolUse" }));
  // One repeat's work: every file tool, every path written as the slot name the
  // agent was given. The tail message ends the stage; the `continue` answers the
  // loop's question in the same session.
  //
  // Ticket 0068: the failing half. A tool that FAILS is a second channel, and it
  // was wide open — the message came from Node, which names the absolute path,
  // so one missing file told the agent its repeat. Each failing call below is
  // aimed at a different env method the file tools reach, because each composes
  // its own error: read's missing file is `readBinaryFile`, read under a file is
  // `exists`, write onto a directory is `writeFile`, write under a file is
  // `canonicalPath` (through Pi's mutation queue), and the failing `edit` is
  // Pi's own rebuild from the given path — the behavior the others now match.
  const works = () => [
    call("write", { path: "$TMP/draft.txt", content: DRAFT }),
    call("edit", { path: "$TMP/draft.txt", edits: [{ oldText: "beta", newText: "gamma" }] }),
    call("read", { path: "$TMP/draft.txt" }),
    call("read", { path: "$TMP/does-not-exist.txt" }),
    call("read", { path: "$TMP/draft.txt/under-a-file.txt" }),
    call("write", { path: "$TMP", content: DRAFT }),
    call("write", { path: "$TMP/draft.txt/beneath-a-file.txt", content: DRAFT }),
    call("edit", { path: "$TMP/does-not-exist.txt", edits: [{ oldText: "beta", newText: "gamma" }] }),
    // Ticket 0067: the THIRD channel, and the one neither 0066 nor 0068 could
    // reach. Slots are real environment variables and the shell expands them
    // itself, so no wrapping composes this away — `bash` is deliberately
    // unwrapped and stays so. What changes is the value: the scratch tree names
    // nothing, so the string the shell prints says nothing either.
    call("bash", { command: `echo ${MARK} $OUTPUT` }),
    call("write", { path: "$OUTPUT", content: EDITED }),
    spy(fauxAssistantMessage("finished")),
  ];
  const answer = (verdict: "continue" | "stop") =>
    call("continue", { answer: verdict, reason: "the draft reads well" });
  const finishAnyway = () => fauxAssistantMessage("finish anyway");
  // The tail is a second, differently-named stage writing the same bytes to
  // `$OUTPUT`: its result string is the loop stage's, character for character,
  // so the stage's own path in the flow is not disclosed either.
  const tail = () => [call("write", { path: "$OUTPUT", content: EDITED }), spy(fauxAssistantMessage("finished"))];
  // The tmp warning precedes the check ladder, so "finish anyway" answers it
  // before the loop's question is asked.
  faux.setResponses([...works(), finishAnyway(), answer("continue"), ...works(), finishAnyway(), answer("stop"), ...tail()]);

  const code = await main(["run", "start", "review/main", "--intelligence", "hard", "the request"], held);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(code).toBe(0);

  // The run really reached the second repeat, so the repeat number existed to
  // be disclosed — a screen over a run that never looped passes vacuously.
  const run = at((await readdir(join(home, "runs"))).filter((entry) => !entry.endsWith(".lock")), 0);
  const events = (await readFile(join(home, "runs", run, "record.jsonl"), "utf8")).trimEnd()
    .split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(events).toContainEqual(expect.objectContaining({ event: "loop_done", repeats: 2, ended_by: "stop" }));

  // The shell's own results, kept apart: `echo $OUTPUT` genuinely differs
  // between the repeats, so it cannot join the set-equality below. It is
  // screened on its own terms, further down.
  const shell = [...results].filter((text) => text.includes(MARK));
  const composed = [...results].filter((text) => !text.includes(MARK));

  // Invariant 5, sharply: the two repeats did the same nine things, so if any
  // tool result carried the repeat, this set would hold eighteen strings, not
  // nine. It also pins the strings themselves — the agent is handed back the
  // slot name it wrote, on success because that is genuinely the string the
  // tool received, and on failure because the env composes the error from the
  // slot form rather than from the resolved path.
  expect(composed.sort()).toEqual([
    "Successfully replaced 1 block(s) in $TMP/draft.txt.",
    `Successfully wrote ${String(DRAFT.length)} bytes to $TMP/draft.txt`,
    `Successfully wrote ${String(EDITED.length)} bytes to $OUTPUT`,
    EDITED,
    "Could not access file: $TMP/does-not-exist.txt. Error code: not_found.",
    "Could not access file: $TMP/draft.txt/under-a-file.txt. Error code: not_directory.",
    "Could not access file: $TMP. Error code: is_directory.",
    "Could not access file: $TMP/draft.txt/beneath-a-file.txt. Error code: not_directory.",
    "Could not edit file: $TMP/does-not-exist.txt. Error code: not_found.",
  ].sort());

  // Invariants 2 and 6: no tool result names the runtime's ground or its words.
  const secrets: Record<string, string> = {
    "the home": home,
    "the run directory": join(home, "runs", run),
    "the assembly root": join(home, "assemblies/review"),
    "the scratch root": cache,
    "the run name": run,
  };
  for (const [label, secret] of Object.entries(secrets)) {
    for (const text of composed) {
      expect(text, `a tool result names ${label}`).not.toContain(secret);
    }
  }
  for (const text of results) {
    for (const pattern of FORBIDDEN) {
      expect(withoutSandbox(text), `a tool result matches ${String(pattern)}`).not.toMatch(pattern);
    }
  }

  // Ticket 0067's own witness, through the channel the runtime does not
  // compose. The two repeats really did print two different paths — a screen
  // over one path, or over a run that never looped, passes vacuously — and
  // NEITHER of them names the stage, the flow, the loop or the repeat.
  //
  // What the shell still shows is the scratch root and the run's name, and that
  // is the honest limit: a runtime is trusted, not a sandbox (runtime.md), the
  // value genuinely is that path, and the `secrets` screen above is therefore
  // not applied here. This ticket makes wandering unrewarding, not impossible.
  expect(shell).toHaveLength(2);
  expect(at(shell, 0)).not.toBe(at(shell, 1));
  for (const text of shell) {
    expect(text, "the shell printed no output path").toContain("output.txt");
    for (const pattern of FORBIDDEN) {
      expect(withoutSandbox(text), `the shell's own expansion matches ${String(pattern)}`).not.toMatch(pattern);
    }
  }
});
