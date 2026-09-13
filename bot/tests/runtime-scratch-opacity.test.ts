// Ticket 0067 — the scratch tree stops describing the graph.
//
// The two trees are separate and only one of them changes. The RUN directory
// (`~/.local/share/bot/runs/<run>/`) keeps naming everything: it is what `bot
// show`, `bot session` and an archive are read through, and the agent never
// sees it. The SCRATCH tree is what `$INPUT`, `$OUTPUT`, `$TMP` and
// `$SUBFLOWS` point at, it is the one an agent can walk, and below the run
// level it now names nothing.
//
// Why this is not hygiene: 0066 and 0068 closed both channels the runtime
// COMPOSES — what a tool says back on success and on failure. Neither could
// reach the third one, because slots are real environment variables and the
// shell expands them itself; `echo $OUTPUT` handed the agent its repeat, its
// stage and its place in the flow. Wrapping the shell is the string
// replacement Ian ruled out, so making the path uninformative is the only road
// left. That channel's own witness is the `bash` leg of
// runtime-tool-disclosure.test.ts; this file witnesses the tree beneath it.
//
// The assertion sources:
// - invariants.md 5: "which repeat of a loop it is in".
// - invariants.md 6: "that any of this exists" — assemblies, flows, stages.
// - subflow.md:86-88: `$SUBFLOWS/<n>` is a NAME the agent is given, numbered
//   in call order, so the call index stays. What the agent infers from a
//   directory name is what goes.
// - inspection.md: `bot show` reads the record, and the record's `output.path`
//   is a run-directory path — so nothing operator-facing needs the scratch
//   layout to find anything.
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";
import { scratchRun } from "./scratch.ts";

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

const WORK = "Workmarker: draft the section and hand the hard part down.";
const ORACLE = "Oraclemarker: answer the hard part.";
const TAIL = "Tailmarker: close the run.";

// Every name the graph carries, from the flow down. None of them may appear in
// a directory name below the run level — nor may a repeat number, nor the
// words the layout used to spell out.
const NAMED = [
  "stages", "subflows", "main", "cycle", "work", "tail", "oracle", "verdict", "review",
];

async function assembly(home: string): Promise<void> {
  const base = join(home, "assemblies/review");
  const stage = join(base, "flows/main/01-cycle/01-work");
  await Promise.all([mkdir(stage, { recursive: true }), mkdir(join(base, "subflows/oracle"), { recursive: true })]);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nA review assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-cycle/LOOP.md"), "---\nrepeat: 2\n---\nIs the draft complete?\n"),
    writeFile(join(stage, "STAGE.md"), `---\n---\n${WORK}\n`),
    writeFile(join(base, "flows/main/02-tail.md"), `---\n---\n${TAIL}\n`),
    writeFile(join(base, "subflows/oracle/FLOW.md"), "---\ndescription: answer the hard part\n---\n"),
    writeFile(join(base, "subflows/oracle/01-verdict.md"), `---\n---\n${ORACLE}\n`),
  ]);
}

// A batch's children run at once, so a positional script cannot say which
// stage a response belongs to. Each queued step is the same router, answering
// as whichever stage's system prompt asked (the cli-subflow-pins idiom).
type Message = ReturnType<typeof fauxAssistantMessage>;
function router(routes: Record<string, (round: number) => Message>) {
  const rounds = new Map<string, number>();
  return (context: { systemPrompt?: string }): Message => {
    const prompt = context.systemPrompt ?? "";
    const key = Object.keys(routes).find((marker) => prompt.includes(marker));
    const route = key === undefined ? undefined : routes[key];
    if (key === undefined || route === undefined) throw new Error(`No route for: ${prompt.slice(0, 200)}`);
    const round = (rounds.get(key) ?? 0) + 1;
    rounds.set(key, round);
    return route(round);
  };
}

function writes(path: string, content: string): Message {
  return fauxAssistantMessage([fauxToolCall("write", { path, content })], { stopReason: "toolUse" });
}

interface Walked { path: string; name: string }
async function walk(directory: string, held: Walked[] = []): Promise<Walked[]> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(directory, entry.name);
    held.push({ path, name: entry.name });
    await walk(path, held);
  }
  return held;
}

const OPAQUE = /^[0-9a-f]{16}$/u;
// The four names that survive are the slots the agent already holds — `$INPUT`,
// `$TMP`, `$SKILLS` and the folder `$SUBFLOWS` points at — plus the call index
// under the last of them, which subflow.md fixes as part of the slot's
// contract. Everything else is a content-free identifier.
const GIVEN = new Set(["input", "tmp", "skills", "answers"]);

// A call index is a bare number STANDING UNDER `answers` — the parent is half
// the name's meaning, and subflow.md:86-88 is what fixes it.
function callIndex({ path, name }: Walked): boolean {
  return /^[1-9][0-9]*$/u.test(name) && basename(dirname(path)) === "answers";
}

async function opaque(scratch: string): Promise<void> {
  const walked = await walk(scratch);
  expect(walked.length).toBeGreaterThan(4);
  for (const entry of walked) {
    const { path, name } = entry;
    expect(OPAQUE.test(name) || GIVEN.has(name) || callIndex(entry), `scratch directory ${relative(scratch, path)}`).toBe(true);
    // Said the other way, in the ticket's own words, so a future vocabulary
    // that slipped past the shape above still goes red.
    for (const word of NAMED) {
      expect(name.toLowerCase(), `scratch directory ${relative(scratch, path)}`).not.toContain(word);
    }
  }
  // Invariant 5 exactly: the loop ran twice, and no directory below the run is
  // a repeat number. The one bare number in the tree is the subflow call index.
  //
  // Digits alone cannot say that. `scratchAttempt` is a sha256 sliced to 16 hex
  // characters, so one attempt name in (16/10)^16 — about 1 in 1,845 — is all
  // decimal digits and answers to a bare-number test as readily as a call index
  // does. Two things tell them apart, and both are already known here: the
  // LENGTH (a call index is never 16 digits) and the PARENT (`answers`), which
  // the per-entry screen above has applied all along.
  const numeric = walked.filter(({ name }) => /^[0-9]+$/u.test(name) && !OPAQUE.test(name));
  expect(numeric.map(({ name }) => name)).toEqual(["1"]);
  expect(basename(dirname(at(numeric, 0).path))).toBe("answers");
  // The two classifications agree, so the length bound above let nothing
  // through: every call index in the tree is one the bare-number screen saw.
  expect(walked.filter(callIndex)).toEqual(numeric);
  // The two repeats of one stage are two different opaque directories, so the
  // opacity is not bought by collapsing them into one.
  const identifiers = walked.filter(({ name }) => OPAQUE.test(name));
  expect(new Set(identifiers.map(({ name }) => name)).size).toBe(identifiers.length);
}

test("a two-repeat LOOP with a subflow leaves a scratch tree whose directories name nothing, and bot show still resolves every stage's output", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-scratch-opacity-"));
  roots.push(root);
  const home = join(root, "home");
  const cache = join(root, "cache");
  await assembly(home);

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

  // Repeat 1 delegates; repeat 2 does not. One subflow call in the whole run,
  // so `$SUBFLOWS/1` is the only call index in the tree.
  const step = router({
    [WORK]: (round) => {
      if (round === 1) return fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "oracle", input: "the hard part" }] })], { stopReason: "toolUse" });
      if (round === 2) return writes("$OUTPUT", "the draft");
      if (round === 3) return fauxAssistantMessage("drafted");
      if (round === 4) return fauxAssistantMessage([fauxToolCall("continue", { answer: "continue", reason: "one more pass" })], { stopReason: "toolUse" });
      if (round === 5) return writes("$OUTPUT", "the draft");
      if (round === 6) return fauxAssistantMessage("drafted");
      return fauxAssistantMessage([fauxToolCall("continue", { answer: "stop", reason: "it reads well" })], { stopReason: "toolUse" });
    },
    [ORACLE]: (round) => (round === 1 ? writes("$OUTPUT", "the answer") : fauxAssistantMessage("child done")),
    [TAIL]: (round) => (round === 1 ? writes("$OUTPUT", "the close") : fauxAssistantMessage("done")),
  });
  faux.setResponses(Array.from({ length: 24 }, () => step));

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  const run = at((await readdir(join(home, "runs"))).filter((entry) => !entry.endsWith(".lock")), 0);
  const record = (await readFile(join(home, "runs", run, "record.jsonl"), "utf8")).trimEnd()
    .split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  // The run really looped and really delegated, so both things this screens
  // for existed to be disclosed. A screen over a run that did neither passes
  // vacuously.
  expect(record).toContainEqual(expect.objectContaining({ event: "loop_done", repeats: 2 }));
  expect(record).toContainEqual(expect.objectContaining({ event: "subflow_call", call: 1, flow: "oracle" }));

  // THE SCRATCH TREE. `<scratch>/<run>/` stays — `bot prune` deletes a run's
  // scratch with the run (0024's ruling) and finds it by the run's name — and
  // everything below it is flat and opaque.
  const scratch = scratchRun(cache, home, run);
  await opaque(scratch);

  // AND THE RUN DIRECTORY IS UNCHANGED: `bot show` still resolves every stage's
  // output, because the record names it as a run-directory path and nothing
  // reconstructs a scratch path from stage identity.
  const ends = record.filter((event) => event["event"] === "stage_end" && event["output"] !== undefined);
  // Both repeats of the loop stage and the tail; the child's own stage_end
  // lives in the child's own record, under the parent's run directory.
  expect(ends).toHaveLength(3);
  for (const end of ends) {
    const output = end["output"] as { path: string };
    expect(output.path).toMatch(/^stages\//u);
    await expect(readFile(join(home, "runs", run, ...output.path.split("/")), "utf8")).resolves.not.toBe("");
  }
  stdout.length = 0;
  await expect(main(["run", "events", run], held)).resolves.toBe(0);
  const shown = Buffer.concat(stdout).toString();
  for (const end of ends) expect(shown).toContain((end["output"] as { path: string }).path);

  // Debuggability, which is the price of opacity: a human can no longer guess
  // where a stage worked, so `bot show` says it. One line per stage attempt,
  // and the directory it names is really there.
  const scratchLines = shown.split("\n").filter((line) => line.startsWith("-  scratch  "));
  expect(scratchLines).toHaveLength(3);
  for (const line of scratchLines) {
    const path = at(line.split("  "), 3);
    expect(path.startsWith(`${scratch}${sep}`), path).toBe(true);
    await expect(readdir(path)).resolves.toEqual(expect.arrayContaining(["input", "skills"]));
  }
});

// Ticket 0063 item 19 — the screen's own latent flake, which no number of suite
// runs can be relied on to show: it needs a sha256 whose first 16 hex
// characters happen to be all decimal digits, about one attempt in 1,845. So
// the pathological name is CONSTRUCTED rather than waited for. Against the
// digits-only filter this tree failed with the flake's exact text,
//
//   expected [ '1197198426693222', '1' ] to deeply equal [ '1' ]
//
// reading an attempt directory as a subflow call index.
test("an attempt directory whose sixteen hex characters are all decimal digits is not read as a call index", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-scratch-opacity-digits-"));
  roots.push(root);
  // The shape a run leaves under `<scratch>/<run>/`, with a name that satisfies
  // BOTH the opaque-identifier test and a bare-number test standing where the
  // attempt directory stands.
  const collision = "1197198426693222";
  expect(OPAQUE.test(collision) && /^[0-9]+$/u.test(collision)).toBe(true);
  const attempt = join(root, collision);
  await Promise.all([
    mkdir(join(attempt, "tmp"), { recursive: true }),
    mkdir(join(attempt, "input"), { recursive: true }),
    mkdir(join(attempt, "answers", "1"), { recursive: true }),
  ]);

  await expect(opaque(root)).resolves.toBeUndefined();
});
