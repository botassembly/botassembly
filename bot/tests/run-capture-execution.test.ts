// Ticket 0117 — THE SIX PAUSE-POINT WITNESSES, the spine of the capture batch.
// ADR 0016 Decision step 8: "Every assembly-owned read and every executable runs
// from the capture: stage bodies, schema templates, sentinel descriptions,
// assembly skills' full contents, gates, hooks", and step 2: "Mid-run edits to
// the live tree take effect on the NEXT run, never this one."
//
// One shape, six times: hold the run at 0116's `captured` seam AFTER the last
// file of the capture has landed — so the capture is COMPLETE and no clock is
// involved — edit exactly one thing in the SOURCE tree, let the run go, and
// assert the run behaved as if the edit had never happened.
//
// THE ASYMMETRY THESE CLOSE, measured on main before the change:
//   stage body ....... already unaffected (parsed once, from the capture, 0116)
//   schema template .. TOOK EFFECT — re-read at check time from the live tree
//   assembly skill ... TOOK EFFECT — materialized into $SKILLS from the live tree
//   sentinel ......... TOOK EFFECT — re-read at prompt time from the live tree
//   gate ............. FATAL — rehashed at execution against the capture's hash
//   hook ............. FATAL — same
// Three took effect and TWO were fatal, not one: the hook is an executable and
// invariant 14 never distinguished it from a gate.
//
// The fixture's bytewise order is load-bearing and asserted below, because it is
// what makes `subflows/helper/FLOW.md` the pause point that means "the copy is
// done". Nothing here reaches a model or the real ~/.pi, ~/.cache or
// ~/.local/share: the provider is faux and BOT_HOME and XDG_CACHE_HOME are
// explicit, under an mkdtemp root this file removes.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import {
  at, events, pauseAfter, queue, realBoundary, router, runsIn, tempRoots, tree, writes, type Seen,
} from "./cli-boundary.ts";
import { attempt, scratchRun } from "./scratch.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

const ASSEMBLY = "---\nintelligence: default\n---\nReview assembly.\n";
const STAGE = "---\n---\nDo the work. Marker: WORK-ONE.\n";
const SCHEMA = "---\ntitle: str\n---\n";
const GATE = "#!/bin/sh\nexit 0\n";
const HOOK = "#!/bin/sh\nexit 0\n";
const SKILL = "---\ndescription: look a fact up\n---\nRun run.sh.\n";
const SKILL_RUN = "#!/bin/sh\necho SKILL-ONE\n";
const FLOW = "---\ndescription: main flow\n---\n";
const HELPER = "---\ndescription: HELPER-ONE, a helper flow\n---\n";
const HELPER_STAGE = "---\n---\nAnswer the question.\n";
const OUTPUT = "---\ntitle: the answer\n---\nthe body\n";

/** The capture in bytewise path order; the last entry is the pause point. */
const FILES = [
  "ASSEMBLY.md",
  "flows/main/01-work/STAGE.md",
  "flows/main/01-work/before.sh",
  "flows/main/01-work/gate.sh",
  "flows/main/01-work/schema.md",
  "flows/main/01-work/skills/lookup/SKILL.md",
  "flows/main/01-work/skills/lookup/run.sh",
  "flows/main/FLOW.md",
  "subflows/helper/01-answer.md",
  "subflows/helper/FLOW.md",
];
const LAST = at(FILES, FILES.length - 1);

/** Every kind of assembly-owned read in one assembly: a stage body, a schema
 *  template, a stage gate, a stage hook, an assembly skill with a script, and a
 *  subflow whose FLOW.md sentinel carries the description the prompt quotes. */
async function sixAssembly(home: string): Promise<string> {
  const base = join(home, "assemblies/review");
  await mkdir(join(base, "flows/main/01-work/skills/lookup"), { recursive: true });
  await mkdir(join(base, "subflows/helper"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), ASSEMBLY),
    writeFile(join(base, "flows/main/FLOW.md"), FLOW),
    writeFile(join(base, "flows/main/01-work/STAGE.md"), STAGE),
    writeFile(join(base, "flows/main/01-work/schema.md"), SCHEMA),
    writeFile(join(base, "flows/main/01-work/gate.sh"), GATE),
    writeFile(join(base, "flows/main/01-work/before.sh"), HOOK),
    writeFile(join(base, "flows/main/01-work/skills/lookup/SKILL.md"), SKILL),
    writeFile(join(base, "flows/main/01-work/skills/lookup/run.sh"), SKILL_RUN),
    writeFile(join(base, "subflows/helper/FLOW.md"), HELPER),
    writeFile(join(base, "subflows/helper/01-answer.md"), HELPER_STAGE),
  ]);
  await Promise.all(["gate.sh", "before.sh"].map((name) => chmod(join(base, "flows/main/01-work", name), 0o755)));
  await chmod(join(base, "flows/main/01-work/skills/lookup/run.sh"), 0o755);
  return base;
}

interface Ran {
  exit: number;
  seen: Seen[];
  stderr: string;
  home: string;
  source: string;
  run: string;
  cache: string;
}

/** One run, held at a completed capture while `edit` changes the source tree. */
async function ranWithSourceEdit(prefix: string, edit: (source: string) => Promise<void>): Promise<Ran> {
  const { root, home } = await roots.scratch(prefix);
  const source = await sixAssembly(home);
  const pause = pauseAfter(LAST);
  const seen: Seen[] = [];
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  // The same step for every round of the one stage: write the output, then say
  // it is done. A check that sends the agent back gets the same pair again, so a
  // retry is expressible rather than a crash — which is how a witness that goes
  // red on main goes red with a RECORD to read rather than an exhausted queue.
  const step = (round: number) => round % 2 === 1 ? writes("$OUTPUT", OUTPUT) : fauxAssistantMessage("done");
  queue(faux, router({ "Do the work": step }, seen), 8);
  const running = main(["run", "start", "review/main", "the request"], { ...held, captured: pause.captured });
  await pause.arrived;
  await edit(source);
  pause.resume();
  const exit = await running;
  return {
    exit, seen, stderr: Buffer.concat(stderr).toString(), home, source,
    run: at(await runsIn(home), 0), cache: join(root, "cache"),
  };
}

function record(ran: Ran): Promise<Record<string, unknown>[]> {
  return events(join(ran.home, "runs", ran.run, "record.jsonl"));
}

/** The one stage's system prompt — the first one the provider was handed. */
function prompt(ran: Ran): string {
  return at(ran.seen, 0).systemPrompt;
}

test("the capture is the fixture in bytewise order, and its last file is the pause point the six witnesses hold at", async () => {
  const ran = await ranWithSourceEdit("bot-six-order-", () => Promise.resolve());
  expect(ran.exit).toBe(0);
  expect(await tree(join(ran.home, "runs", ran.run, "assembly"))).toEqual(FILES);
});

// WITNESS 1 — the stage body. GREEN on main already: `readAssembly` parses once,
// and since 0116 it parses the capture. Kept because it is one of the six ADR
// 0016 names, and because a later change that re-read a stage body at prompt
// time would reopen exactly the seam this batch closed.
test("a stage body edited in the source after the capture: the prompt is the captured instruction", async () => {
  const ran = await ranWithSourceEdit("bot-six-body-", (source) =>
    writeFile(join(source, "flows/main/01-work/STAGE.md"), STAGE.replace("WORK-ONE", "WORK-TWO")));
  expect(ran.stderr).toBe("");
  expect(ran.exit).toBe(0);
  expect(prompt(ran)).toContain("WORK-ONE");
  expect(prompt(ran)).not.toContain("WORK-TWO");
});

// WITNESS 2 — the schema template (prompt-assembly.ts:51 for the prompt,
// schema-check.ts:30 for the check). RED on main: the check re-read the live
// file, the output did not carry `missing`, and the agent was sent back.
test("a schema template edited in the source after the capture: the captured template is what the output is judged by", async () => {
  const ran = await ranWithSourceEdit("bot-six-schema-", (source) =>
    writeFile(join(source, "flows/main/01-work/schema.md"), "---\nmissing: str\n---\n"));
  expect(ran.stderr).toBe("");
  expect(ran.exit).toBe(0);
  const held = await record(ran);
  // One schema check, and it passed: the template that judged the output is the
  // captured `title: str`, not the source's `missing: str`.
  expect(held.filter((event) => event["event"] === "check" && event["check"] === "schema"))
    .toEqual([expect.objectContaining({ exit: 0 })]);
  // And no send-back: one attempt, the first.
  expect(held.filter((event) => event["event"] === "stage_start").map((event) => event["retry"])).toEqual([1]);
  // The prompt showed the captured template too (prompt-assembly.ts:51).
  expect(prompt(ran)).toContain("title: str");
  expect(prompt(ran)).not.toContain("missing: str");
});

// WITNESS 3 — an assembly skill's full contents, materialized into `$SKILLS`
// (flow.ts `prepareStage`). RED on main: `cp` read the live directory, so the
// stage was handed a script the run's `assembly_hash` did not cover.
test("an assembly skill's script edited in the source after the capture: $SKILLS holds the captured bytes", async () => {
  const ran = await ranWithSourceEdit("bot-six-skill-", (source) =>
    writeFile(join(source, "flows/main/01-work/skills/lookup/run.sh"), SKILL_RUN.replace("SKILL-ONE", "SKILL-TWO")));
  expect(ran.stderr).toBe("");
  expect(ran.exit).toBe(0);
  const materialized = join(attempt(scratchRun(ran.cache, ran.home, ran.run), "01-work"), "skills/lookup/run.sh");
  await expect(readFile(materialized, "utf8")).resolves.toBe(SKILL_RUN);
});

// WITNESS 4 — a subflow sentinel's description (prompt-assembly.ts:43). RED on
// main: the description was re-read at prompt time from the live tree, so the
// prompt named a helper by words that were in no hashed byte of this run.
test("a subflow sentinel's description edited in the source after the capture: the prompt names the captured description", async () => {
  const ran = await ranWithSourceEdit("bot-six-sentinel-", (source) =>
    writeFile(join(source, "subflows/helper/FLOW.md"), HELPER.replace("HELPER-ONE", "HELPER-TWO")));
  expect(ran.stderr).toBe("");
  expect(ran.exit).toBe(0);
  expect(prompt(ran)).toContain("HELPER-ONE");
  expect(prompt(ran)).not.toContain("HELPER-TWO");
});

// WITNESS 5 — a gate (executables.ts). RED on main, and FATAL: the gate was
// executed from the live tree while its expected hash came from the capture, so
// a source edit drifted and ended the run at exit 2. ADR 0016 rules that
// consequence away: the capture never saw the edit, so there is nothing to
// drift. `bot-does-not-exist` would make the gate unrunnable if it ever ran.
test("a gate edited in the source after the capture: the captured gate runs, and the run does not end", async () => {
  const ran = await ranWithSourceEdit("bot-six-gate-", (source) =>
    writeFile(join(source, "flows/main/01-work/gate.sh"), "#!/bin/sh\necho 'the source gate says no'\nexit 1\n"));
  expect(ran.stderr).toBe("");
  expect(ran.exit).toBe(0);
  const held = await record(ran);
  expect(held.filter((event) => event["event"] === "check" && event["check"] === "gate"))
    .toEqual([expect.objectContaining({ exit: 0, file: "flows/main/01-work/gate.sh" })]);
  expect(held.filter((event) => event["event"] === "hash_drift")).toEqual([]);
});

// WITNESS 6 — a hook (executables.ts). RED on main, and FATAL for the same
// reason as the gate: invariant 14's rehash never distinguished the two.
test("a hook edited in the source after the capture: the captured hook runs, and the run does not end", async () => {
  const ran = await ranWithSourceEdit("bot-six-hook-", (source) =>
    writeFile(join(source, "flows/main/01-work/before.sh"), "#!/bin/sh\nexit 3\n"));
  expect(ran.stderr).toBe("");
  expect(ran.exit).toBe(0);
  const held = await record(ran);
  expect(held.filter((event) => event["event"] === "hook"))
    .toEqual([expect.objectContaining({ hook: "before", exit: 0 })]);
  expect(held.filter((event) => event["event"] === "hash_drift")).toEqual([]);
});

// WITNESS 7 (ticket 0133) — the ADR's own verification list also names
// "redirect the source assembly after capture and witness the record still name
// the original path", and the six above never move the tree: each edits a file
// where it stands, so nothing they do could catch a run that re-resolved
// `assemblies/review` and read whatever is there now. This one moves the source
// out from under the run and stands a DIFFERENT assembly in its place — a
// different instruction, a gate that refuses, a template nothing satisfies —
// and the run must be indifferent to all three at once.
test("the source assembly replaced by a different tree after the capture: the run keeps executing its capture", async () => {
  const ran = await ranWithSourceEdit("bot-six-redirect-", async (source) => {
    await rename(source, join(source, "..", "moved-aside"));
    const standing = await sixAssembly(join(source, "..", ".."));
    await Promise.all([
      writeFile(join(standing, "flows/main/01-work/STAGE.md"), STAGE.replace("WORK-ONE", "WORK-THREE")),
      writeFile(join(standing, "flows/main/01-work/schema.md"), "---\nmissing: str\n---\n"),
      writeFile(join(standing, "flows/main/01-work/gate.sh"), "#!/bin/sh\necho 'the standing gate says no'\nexit 1\n"),
    ]);
  });
  expect(ran.stderr).toBe("");
  expect(ran.exit).toBe(0);
  // The redirect happened and what stands there really is different, so every
  // assertion below could have gone the other way.
  await expect(readFile(join(ran.source, "flows/main/01-work/STAGE.md"), "utf8")).resolves.toContain("WORK-THREE");
  // The instruction, the template and the gate are all the capture's.
  expect(prompt(ran)).toContain("WORK-ONE");
  expect(prompt(ran)).toContain("title: str");
  const held = await record(ran);
  expect(held.filter((event) => event["event"] === "check" && event["check"] === "gate"))
    .toEqual([expect.objectContaining({ exit: 0, file: "flows/main/01-work/gate.sh" })]);
  expect(held.filter((event) => event["event"] === "hash_drift")).toEqual([]);
  // And the record still names the assembly the run was asked for, by the name
  // it was asked by — not the tree that now stands there, and not the capture.
  expect(at(held, 0)).toMatchObject({ event: "run_start", assembly: "review" });
  expect(await tree(join(ran.home, "runs", ran.run, "assembly"))).toEqual(FILES);
});
