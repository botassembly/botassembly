// Ticket 0052 — pin queue P10, the small singles that need a REAL run: the
// `~/.cache` scratch fallback (leg 2), the one-session-per-repeat promise
// (leg 3), and the stage body reaching the agent through the real runner
// (leg 4). All three go through the REAL defaultGating via main() with the
// faux provider (the cli-stage-options idiom, 0041; the boundary shape,
// 0048/0051). The assertion sources:
// - slots.md:129-131: `$TMP` "sits in a cache directory the runtime owns
//   (`$XDG_CACHE_HOME/bot/tmp/`, `~/.cache` by default), so no slot value
//   discloses where runs live". Code: scratchRoot (invocation.ts:43-45),
//   `XDG_CACHE_HOME ?? $HOME/.cache`, both read from the INJECTED env.
// - session.md:39-40: "Name it so the record can point at it. One session
//   covers every attempt of one repeat, because a held agent keeps working in
//   the session it already had"; stage.md:142-144: "A failing check does not
//   start the agent over: the agent has not left, its session is intact, and
//   the reason it was held goes into that session as one more thing it has
//   read"; record.md:182-184: "A session sits at the repeat level, because a
//   held agent keeps its session across every attempt. An output and its check
//   captures sit at the attempt level."
// - prompt.md:8-11: what the agent is told — "Its instruction — the markdown
//   body of its stage" and "The assembly's purpose — the body of `ASSEMBLY.md`,
//   which enters every stage"; prompt.md:12-13: "Its input — that `$INPUT` is a
//   directory, and the name of every file in it."
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { checkSync } from "proper-lockfile";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";
import { attempt, scratchRun } from "./scratch.ts";

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

// The env is built EXPLICITLY (the 0051 shape): XDG_CACHE_HOME and BOT_HOME are
// destructured out of the inherited environment so a leg that needs
// XDG_CACHE_HOME ABSENT really has it absent, while PATH and the rest still
// pass through. BOT_HOME always names a scratch home, so resolveHome's
// homedir() rung is never reached and the real `~/.local/share` is never a
// candidate.
function realBoundary(root: string, env: NodeJS.ProcessEnv, output: Buffer[], errors: Buffer[]) {
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const { XDG_CACHE_HOME: _cache, BOT_HOME: _home, ...inherited } = process.env;
  const held: CliBoundary = {
    cwd: root,
    env: { ...inherited, PWD: root, ...env },
    stdinIsTTY: true,
    stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { output.push(Buffer.from(bytes)); },
    stderr: (bytes) => { errors.push(Buffer.from(bytes)); },
    clock,
    models,
  };
  return { held, faux };
}

// Index into what a run produced, refusing to paper over a short list: a
// missing element is a real failure, not an empty string.
function at<Item>(items: readonly Item[], index: number): Item {
  const held = items[index];
  if (held === undefined) throw new Error(`nothing at index ${String(index)}`);
  return held;
}

async function record(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

// The two distinctive sentences leg 4 tracks: one authored in ASSEMBLY.md's
// body, one in STAGE.md's. Nothing else in the tree contains either, so finding
// them in what the provider was sent can only mean the authored files got there.
const PURPOSE = "This assembly audits ledgers with a peculiar marmot rigour.";
const INSTRUCTION = "Weigh the quartz before signing the marmot ledger.";

// One folder-form stage. `gate` is optional; when given it is the stage's gate
// script, made executable like the sibling fixtures do.
async function assembly(home: string, gate?: string): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), `---\nintelligence: default\n---\n${PURPOSE}\n`),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), `---\n---\n${INSTRUCTION}\n`),
    ...(gate === undefined ? [] : [writeFile(join(stage, "gate"), gate)]),
  ]);
  if (gate !== undefined) await chmod(join(stage, "gate"), 0o755);
}

function writes(content: string) {
  return [
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ];
}

// Leg 2 — slots.md:129-131. With XDG_CACHE_HOME absent from the injected
// environment, scratchRoot falls back to `$HOME/.cache` (invocation.ts:44),
// and HOME is the INJECTED one, so the leg is reachable without touching the
// process environment at all. A success hook prints its slots, because "whatever
// a hook prints on stdout and stderr is captured as diagnostics and kept with
// the run" (hooks.md) — an on-disk witness of the paths the agent itself saw.
test("leg 2 — with XDG_CACHE_HOME absent the scratch root is the injected HOME's `~/.cache`: $TMP and $INPUT land under <HOME>/.cache/bot/tmp, and the real ~/.cache is untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-cache-fallback-"));
  roots.push(root);
  const home = join(root, "home");
  const user = join(root, "user");
  await mkdir(user, { recursive: true });
  await assembly(home);
  const stage = join(home, "assemblies/review/flows/main/01-work");
  await writeFile(join(stage, "success"), "#!/bin/sh\nprintf 'tmp=[%s]\\ninput=[%s]\\n' \"$TMP\" \"$INPUT\"\nexit 0\n");
  await chmod(join(stage, "success"), 0o755);

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  // HOME is injected; XDG_CACHE_HOME is absent (destructured out above and not
  // re-added here), which is exactly the `~/.cache by default` branch.
  const { held, faux } = realBoundary(root, { BOT_HOME: home, HOME: user }, stdout, stderr);
  expect(held.env["XDG_CACHE_HOME"]).toBeUndefined();
  faux.setResponses(writes("the answer"));

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the answer");

  const run = at(await readdir(join(home, "runs")), 0);
  const capture = join(home, "runs", run, "stages/01-work/1/1/hooks/success.txt");
  // `~/.cache by default`, and the stage attempt beneath it — opaque since
  // ticket 0067, so it is asked for rather than spelled out.
  const scratchStage = attempt(scratchRun(join(user, ".cache"), home, run), "01-work");
  await expect(readFile(capture, "utf8")).resolves.toBe(
    `tmp=[${join(scratchStage, "tmp")}]\ninput=[${join(scratchStage, "input")}]\n`,
  );

  // `$INPUT` survives stage cleanup, so the fallback tree remains inspectable
  // on disk for the stage input the record also names.
  await expect(readdir(join(scratchStage, "input"))).resolves.toEqual(["request.txt"]);
  const events = await record(join(home, "runs", run, "record.jsonl"));
  expect(events.find((event) => event["event"] === "stage_start")?.["received"])
    .toEqual([expect.objectContaining({ name: "request.txt", path: "request.txt" })]);

  // The negative half, on the machine running this test: nothing named after
  // this run exists under the REAL `~/.cache` — the fallback followed the
  // injected HOME, not the ambient one.
  expect(existsSync(join(homedir(), ".cache", "bot", "tmp", run))).toBe(false);
});

// Legs 3 and 4 share ONE fixture and ONE run: a gate that says no on the first
// round and yes on the second, so the stage reaches attempt 2 through the real
// runner. The gate's memory is a file outside the home, touched on its first
// call — nothing in the record depends on it beyond the two rounds it produces.
test("legs 3 and 4 — one session covers both attempts of the repeat, holding attempt 1's turns and the send-back reason; and the authored bodies reach the provider's system prompt, byte-identical across rounds", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-session-prompt-"));
  roots.push(root);
  const home = join(root, "home");
  const once = join(root, "gate-ran-once");
  await assembly(home, `#!/bin/sh\nif [ -f '${once}' ]; then exit 0; fi\n: > '${once}'\necho 'the gate says no this once'\nexit 1\n`);

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, { BOT_HOME: home, XDG_CACHE_HOME: join(root, "cache") }, stdout, stderr);

  // Leg 4's seam: a faux response factory is handed the Context the REAL runner
  // built — the public shape `(context, options, state, model) => message`
  // (pi-ai's FauxResponseStep). This is the honest view of the system prompt:
  // it is what the provider was sent. The session file keeps the turns and
  // never the system prompt — since ticket 0118 the run directory keeps it in
  // `system.txt`, and prompt-retained.test.ts is what holds the two views
  // equal, byte for byte.
  const seen: { systemPrompt: string; messages: string }[] = [];
  const spy = (message: ReturnType<typeof fauxAssistantMessage>) => (context: { systemPrompt?: string; messages: unknown[] }) => {
    seen.push({ systemPrompt: context.systemPrompt ?? "", messages: JSON.stringify(context.messages) });
    return message;
  };
  faux.setResponses([
    // Attempt 1: writes the output, stops. The gate says no, and the agent is
    // held — sent back into the session it already has.
    spy(fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "the work" })], { stopReason: "toolUse" })),
    spy(fauxAssistantMessage("first attempt, quartz weighed")),
    // Attempt 2: the same $OUTPUT bytes stand; the gate says yes this time.
    spy(fauxAssistantMessage("second attempt, marmot ledger signed")),
  ]);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the work");

  const run = at(await readdir(join(home, "runs")), 0);
  const events = await record(join(home, "runs", run, "record.jsonl"));

  // The run really reached attempt 2: two gate rounds, no then yes, each with
  // its own attempt-level capture (record.md:184-185: check captures sit at the
  // attempt level).
  expect(events.filter((event) => event["event"] === "check" && event["check"] === "gate")).toEqual([
    expect.objectContaining({ retry: 1, exit: 1, capture: "stages/01-work/1/1/checks/gate.txt" }),
    expect.objectContaining({ retry: 2, exit: 0, capture: "stages/01-work/1/2/checks/gate.txt" }),
  ]);

  // LEG 3, the promise as the spec actually words it. session.md:39-40: "One
  // session covers every attempt of one repeat"; record.md:182-183: "A session
  // sits at the repeat level". Both attempts' stage_start name the SAME file,
  // at the REPEAT level — `stages/01-work/1/session.jsonl`, with no attempt
  // number in it.
  const starts = events.filter((event) => event["event"] === "stage_start" && event["stage"] === "01-work");
  expect(starts.map((event) => event["retry"])).toEqual([1, 2]);
  expect(starts.map((event) => event["session"])).toEqual([
    "stages/01-work/1/session.jsonl", "stages/01-work/1/session.jsonl",
  ]);

  // And on disk the same thing, in the shape record.md's layout draws: the
  // repeat directory holds ONE session beside the two attempt directories, and
  // neither attempt directory holds a session of its own. The two prompt files
  // joined it at the repeat level in ticket 0118 (ADR 0016 step 7) — one per
  // repeat, not per attempt, which is the same rule the session follows;
  // prompt-retained.test.ts is where their bytes are judged.
  const repeat = join(home, "runs", run, "stages/01-work/1");
  await expect(readdir(repeat)).resolves.toEqual(["1", "2", "first-turn.txt", "session.jsonl", "system.txt"]);
  await expect(readdir(join(repeat, "1"))).resolves.toEqual(["checks", "output.txt"]);
  await expect(readdir(join(repeat, "2"))).resolves.toEqual(["checks", "output.txt"]);

  // The file is APPENDED to, not replaced (session.md:41-42): attempt 1's turn,
  // the reason it was held (stage.md:143-144: "the reason it was held goes into
  // that session as one more thing it has read" — the gate's capture, byte for
  // byte), and attempt 2's turn all sit in the one file, in that order.
  const session = await readFile(join(repeat, "session.jsonl"), "utf8");
  const first = session.indexOf("first attempt, quartz weighed");
  const held1 = session.indexOf("the gate says no this once");
  const second = session.indexOf("second attempt, marmot ledger signed");
  expect(first).toBeGreaterThanOrEqual(0);
  expect(held1).toBeGreaterThan(first);
  expect(second).toBeGreaterThan(held1);
  await expect(readFile(join(repeat, "1/checks/gate.txt"), "utf8")).resolves.toBe("the gate says no this once\n");

  // LEG 4 — prompt.md:8-11. The stage's own markdown body and ASSEMBLY.md's
  // body are both in the system prompt the REAL runner sent, under the headings
  // buildSystemPrompt gives them.
  expect(seen).toHaveLength(3);
  const system = at(seen, 0).systemPrompt;
  expect(system).toContain(`# Purpose\n\n${PURPOSE}`);
  expect(system).toContain(`# Instructions\n\n${INSTRUCTION}`);

  // prompt.md:12-13 — "Its input — that `$INPUT` is a directory, and the name
  // of every file in it": the first user message names request.txt and nothing
  // else. (Messages are compared as their JSON, which is what the provider was
  // handed; the literal is newline-free so no escaping is in play.)
  expect(at(seen, 0).messages).toContain("The files in `$INPUT` are:");
  expect(at(seen, 0).messages).toContain("- `request.txt`");

  // Cache discipline (ADR 0012, CHECKLIST item 16): the system prompt is the
  // stable prefix, and a send-back does not disturb it — round 3, the attempt-2
  // call, was sent the same bytes as round 1.
  expect(at(seen, 2).systemPrompt).toBe(system);
  // The held agent's context GREW instead of restarting: attempt 2's call
  // carries strictly more messages than attempt 1's first call, and attempt 1's
  // words are still in front of it (stage.md:142-143: "its session is intact").
  expect(at(seen, 2).messages.length).toBeGreaterThan(at(seen, 0).messages.length);
  expect(at(seen, 2).messages).toContain("first attempt, quartz weighed");
});

// Ticket 0027 — a record is an audit source, not a recipe for reconstructing
// scratch conventions. The gate receives the very environment the stage does;
// its two captures therefore witness the values that each stage_start must name.
test("stage starts record the five resolved slots the stage received, including a gate retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-record-stage-slots-"));
  roots.push(root);
  const home = join(root, "home");
  const once = join(root, "gate-ran-once");
  await assembly(home, `#!/bin/sh
printf 'pwd=%s\\ninput=%s\\noutput=%s\\ntmp=%s\\nskills=%s\\n' "$PWD" "$INPUT" "$OUTPUT" "$TMP" "$SKILLS"
if [ -f '${once}' ]; then exit 0; fi
: > '${once}'
exit 1
`);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, { BOT_HOME: home, XDG_CACHE_HOME: join(root, "cache") }, stdout, stderr);
  faux.setResponses([...writes("the answer"), fauxAssistantMessage("second attempt")]);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  const run = at(await readdir(join(home, "runs")), 0);
  const events = await record(join(home, "runs", run, "record.jsonl"));
  const starts = events.filter((event) => event["event"] === "stage_start");
  const gates = events.filter((event) => event["event"] === "check" && event["check"] === "gate");
  const seen = await Promise.all(gates.map(async (event) => {
    const capture = event["capture"];
    if (typeof capture !== "string") throw new Error("Gate check has no capture.");
    const lines = (await readFile(join(home, "runs", run, ...capture.split("/")), "utf8")).trimEnd().split("\n");
    const slot = (name: string): string => {
      const line = lines.find((held) => held.startsWith(`${name}=`));
      if (line === undefined) throw new Error(`Gate did not receive ${name}.`);
      return line.slice(name.length + 1);
    };
    return {
      pwd: slot("pwd"), input: slot("input"), output: slot("output"),
      tmp: slot("tmp"), skills: slot("skills"),
    };
  }));

  expect(starts.map((event) => event["retry"])).toEqual([1, 2]);
  expect(seen.flatMap((slots) => Object.values(slots)).every(isAbsolute)).toBe(true);
  expect(starts.map((event) => event["slots"])).toEqual(seen);
});

// Ticket 0033 — runtime.md#liveness: "A run holds a lock for as long as it is
// running… The lock sits beside the run's directory rather than inside it".
// Observed from inside the model's turn, which only happens while the run is
// running, and again after main() returns.
test("leg 5 — the run holds a lock beside its directory while it runs, and releases it at the end", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-liveness-"));
  roots.push(root);
  const home = join(root, "home");
  await assembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, { BOT_HOME: home, XDG_CACHE_HOME: join(root, "cache") }, stdout, stderr);
  const observed: boolean[] = [];
  const watch = (message: ReturnType<typeof fauxAssistantMessage>) => async () => {
    const name = at((await readdir(join(home, "runs"))).filter((entry) => !entry.endsWith(".lock")), 0);
    observed.push(checkSync(join(home, "runs", name), { realpath: false }));
    return message;
  };
  faux.setResponses(writes("the answer").map(watch));

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(observed).toEqual([true, true]);

  // Released, and nothing left beside the run: `runs/` holds one directory per
  // run again (home.md), so the lock is not something a reader has to skip.
  const run = at(await readdir(join(home, "runs")), 0);
  await expect(readdir(join(home, "runs"))).resolves.toEqual([run]);
  expect(checkSync(join(home, "runs", run), { realpath: false })).toBe(false);
});
