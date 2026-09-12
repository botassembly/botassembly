// Ticket 0056 — the subflow pin batch. Every leg here goes through the REAL
// defaultGating via main(["run", "start", ...]) with the faux provider and an injected
// CliBoundary (the cli-* idiom, 0041/0052), so what is witnessed is the
// runtime's own resolution, its own scratch, and its own record.
//
// What is ALREADY pinned elsewhere is not repeated: child option rungs
// (cli-child-options.test.ts:76-133), numbering across retries and the
// input.txt/output.txt pair for one inline call (flow.test.ts:280,357), a
// child fault not failing the parent (hostile-flow.test.ts:287-304), DESCEND
// depth exposure (flow.test.ts:364-380), declared slots crossing and parent
// env not crossing (flow.test.ts:268-270). The assertion sources:
// - subflow.md:86-88: "Every call lands in the `$SUBFLOWS` slot, numbered in
//   the order the calls were made, across batches, starting at 1".
// - subflow.md:99-105: "a typed pair. `input` carries the extension of what
//   was sent: `.txt` for inline text, the file's own extension for an
//   `input-file`. `output` carries the extension the child's final stage's
//   schema chose. Both names are constant whatever flow ran".
// - subflow.md:112-115: "At most 10,000 bytes: the whole output, inline.
//   Larger: a marked bounded prefix, and the path to the rest."
// - subflow.md:77-79: "What a child inherits is ... the input as its request,
//   the parent's `$PWD`, and the assembly's declared slot values".
// - skills.md:27-31 + subflow.md:21: a subflow's own `skills/` is its flow
//   scope. skills.md:48-50: "Names collide by overriding, narrowest first."
// - subflow.md:119-125: "A child that fails or refuses does not fail the
//   parent ... The call's folder keeps the input and no output."
// - subflow.md:147-149: "`bot runs` lists top-level runs only, and a child is
//   reached through its parent."
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { childRecordAgrees } from "../src/child-record.ts";
import { heldRecord } from "../src/record-lines.ts";
import { CAUSES } from "../src/spine.ts";
import { at, callsSubflow, events, queue, realBoundary, router, tempRoots, writes, type Seen } from "./cli-boundary.ts";
import { attempt, childRun, scratchRun } from "./scratch.ts";
import { printedLines } from "./invoke.ts";

const { scratch, cleanup } = tempRoots();
afterEach(async () => { await cleanup(); });

// The parent's $SUBFLOWS and $SKILLS live in the runtime's scratch root, which
// the injected XDG_CACHE_HOME puts inside the test's own tmp (slots.md:129-131)
// and which ticket 0067 made opaque below the run — so a stage's directory is
// asked for rather than spelled, and `$SUBFLOWS` is its `answers` folder.
function stageScratch(root: string, run: string, stage: string): string {
  return attempt(scratchRun(join(root, "cache"), join(root, "home"), run), stage);
}

const PARENT = "Parent stage: hand the question down.";

function toolContents(messages: string): string[] {
  const parsed = JSON.parse(messages) as { role: string; content?: string | { text?: string }[] }[];
  return parsed.filter((message) => message.role === "toolResult").flatMap((message) =>
    typeof message.content === "string" ? [message.content] : (message.content ?? []).map((part) => part.text ?? ""));
}

// LEG 1 — subflow.md:86-88 and 99-105. Three calls in TWO batches from one
// stage: the numbering continues across the batch boundary, and each folder is
// the typed pair.
test("leg 1 — $SUBFLOWS numbers calls from 1 across batches, each folder an input/output pair extensioned by what was sent and by the child's schema", async () => {
  const { root, home } = await scratch("bot-cli-subflow-numbering-");
  const base = join(home, "assemblies/review");
  const shaped = join(base, "subflows/shaped/01-answer");
  const parent = join(base, "flows/main/01-parent");
  await Promise.all([mkdir(parent, { recursive: true }), mkdir(join(base, "subflows/plain"), { recursive: true }), mkdir(shaped, { recursive: true })]);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nA review assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(parent, "STAGE.md"), `---\n---\n${PARENT}\n`),
    writeFile(join(parent, "gate.sh"), "#!/bin/sh\nprintf '%s' \"$SUBFLOWS\"\n"),
    writeFile(join(base, "subflows/plain/FLOW.md"), "---\ndescription: answer without a shape\n---\n"),
    writeFile(join(base, "subflows/plain/01-answer.md"), "---\n---\nPlainchild writes prose.\n"),
    writeFile(join(base, "subflows/shaped/FLOW.md"), "---\ndescription: answer under a shape\n---\n"),
    writeFile(join(shaped, "STAGE.md"), "---\n---\nShapedchild writes data.\n"),
    writeFile(join(shaped, "schema.json"), '{"type":"object","required":["answer"]}\n'),
  ]);
  await chmod(join(parent, "gate.sh"), 0o755);

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  const seen: Seen[] = [];
  queue(faux, router({
    [PARENT]: (round) => {
      if (round === 1) return writes("$TMP/page.json", '{"page":3}');
      if (round === 2) return callsSubflow([{ flow: "plain", input: "the first question" }]);
      if (round === 3) return callsSubflow([{ flow: "shaped", "input-file": "$TMP/page.json" }, { flow: "plain", input: "the third question" }]);
      if (round === 4) return writes("$OUTPUT", "parent answer");
      return fauxAssistantMessage("parent done");
    },
    // Each child is a run of its own with a fresh session, so the plain child's
    // rounds run 1..4 across its two invocations: odd writes, even ends.
    "Plainchild": (round) => (round % 2 === 1 ? writes("$OUTPUT", "plain answer") : fauxAssistantMessage("child done")),
    "Shapedchild": (round) => (round === 1 ? writes("$OUTPUT", '{"answer":"shaped"}') : fauxAssistantMessage("child done")),
  }, seen), 24);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("parent answer");

  const run = at((await readdir(join(home, "runs"))).filter((entry) => !entry.endsWith(".lock")), 0);
  const answers = join(stageScratch(root, run, "01-parent"), "answers");

  // "numbered in the order the calls were made, across batches, starting at 1":
  // batch one made call 1, batch two made calls 2 and 3 — the counter did not
  // restart when the second batch began.
  await expect(readdir(answers)).resolves.toEqual(["1", "2", "3"]);

  // "Both names are constant whatever flow ran": every folder is input/output,
  // and the extensions are the two rules — .txt for inline text, the file's own
  // extension for an input-file, the child's schema for the output.
  await expect(readdir(join(answers, "1"))).resolves.toEqual(["input.txt", "output.txt"]);
  await expect(readdir(join(answers, "2"))).resolves.toEqual(["input.json", "output.json"]);
  await expect(readdir(join(answers, "3"))).resolves.toEqual(["input.txt", "output.txt"]);
  await expect(readFile(join(answers, "1/input.txt"), "utf8")).resolves.toBe("the first question");
  await expect(readFile(join(answers, "2/input.json"), "utf8")).resolves.toBe('{"page":3}');
  await expect(readFile(join(answers, "2/output.json"), "utf8")).resolves.toBe('{"answer":"shaped"}');
  await expect(readFile(join(answers, "3/input.txt"), "utf8")).resolves.toBe("the third question");

  // The record agrees, and the child runs sit under the calling attempt at the
  // same numbers (subflow.md:143-145).
  const record = await events(join(home, "runs", run, "record.jsonl"));
  const calls = record.filter((event) => event["event"] === "subflow_call");
  expect(calls.map((event) => [event["call"], event["flow"]])).toEqual([[1, "plain"], [2, "shaped"], [3, "plain"]]);
  const parentStart = record.find((event) => event["event"] === "stage_start" && event["stage"] === "01-parent");
  const gate = record.find((event) => event["event"] === "check" && event["check"] === "gate");
  const observedSubflows = await readFile(join(home, "runs", run, String(gate?.["capture"])), "utf8");
  expect((parentStart?.["slots"] as Record<string, unknown> | undefined)?.["subflows"]).toBe(observedSubflows);
  await expect(heldRecord(join(home, "runs", run))).resolves.toMatchObject({ classification: "valid" });
  const nested = join(home, "runs", run, "stages/01-parent/1/1/subflows");
  await expect(readdir(nested)).resolves.toEqual(["1", "2", "3"]);
  for (const call of ["1", "2", "3"]) {
    await expect(readFile(join(nested, call, "record.jsonl"), "utf8")).resolves.toContain('"event":"run_start"');
    const reference = `stages/01-parent/1/1/subflows/${call}`;
    const child = await heldRecord(join(home, "runs", run), `${reference}/record.jsonl`);
    expect(child === undefined ? false : await childRecordAgrees(join(home, "runs", run), reference, calls[Number(call) - 1] ?? {}, child)).toBe(true);
  }
});

// The two sizes leg 2 turns on: one output exactly fills the byte cap, and
// the other exceeds it on one line. The latter is the regression shape: a line
// count cannot bound it.
const SMALL = `S${"x".repeat(9_999)}`;
const LARGE = `L${"é".repeat(6_000)}-tail`;

// LEG 2 — subflow.md:111-115. Two children in one batch, one on each side of
// the threshold, so one run witnesses both branches. What a model was sent is
// the honest seam, and `router` records it.
test("leg 2 — an output of exactly 10,000 bytes enters the context whole, and a larger single line is a marked bounded prefix with the path to the rest", async () => {
  expect(Buffer.byteLength(SMALL)).toBe(10_000);
  expect(Buffer.byteLength(LARGE)).toBeGreaterThan(10_000);
  const { root, home } = await scratch("bot-cli-subflow-threshold-");
  const base = join(home, "assemblies/review");
  await Promise.all([
    mkdir(join(base, "flows/main"), { recursive: true }),
    mkdir(join(base, "subflows/small"), { recursive: true }),
    mkdir(join(base, "subflows/large"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nA review assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-parent.md"), `---\n---\n${PARENT}\n`),
    writeFile(join(base, "subflows/small/FLOW.md"), "---\ndescription: answer briefly\n---\n"),
    writeFile(join(base, "subflows/small/01-answer.md"), "---\n---\nSmallchild answers.\n"),
    writeFile(join(base, "subflows/large/FLOW.md"), "---\ndescription: answer at length\n---\n"),
    writeFile(join(base, "subflows/large/01-answer.md"), "---\n---\nLargechild answers.\n"),
  ]);

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  const seen: Seen[] = [];
  queue(faux, router({
    [PARENT]: (round) => {
      if (round === 1) return callsSubflow([{ flow: "small", input: "brief" }, { flow: "large", input: "long" }]);
      if (round === 2) return writes("$OUTPUT", "parent answer");
      return fauxAssistantMessage("parent done");
    },
    "Smallchild": (round) => (round === 1 ? writes("$OUTPUT", SMALL) : fauxAssistantMessage("child done")),
    "Largechild": (round) => (round === 1 ? writes("$OUTPUT", LARGE) : fauxAssistantMessage("child done")),
  }, seen), 24);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  // The parent's call AFTER the batch is the one carrying the tool result. It
  // is the parent's second turn, so the third prompt the parent was sent.
  const parentTurns = seen.filter((step) => step.systemPrompt.includes(PARENT));
  const afterBatch = at(parentTurns, 1).messages;

  // "At most 10,000 bytes: the whole output, inline" — the final byte of the
  // exact-boundary answer is there, so nothing was cut.
  expect(afterBatch).toContain(SMALL);

  // A one-line output beyond the cap is a marked, bounded prefix. Its result
  // still names the full size and the path from which an agent reads the tail.
  const results = at(toolContents(afterBatch).filter((content) => content.includes("$SUBFLOWS/2/output.txt")), 0);
  const large = results.slice(results.indexOf("Call 2 (large)"));
  const content = large.slice(large.indexOf("\n") + 1);
  expect(large).toContain(`${String(Buffer.byteLength(LARGE))} bytes, 1 lines`);
  expect(content).toContain("output truncated");
  expect(content).toContain("Léééééééééé");
  expect(content).not.toContain("-tail");
  expect(Buffer.byteLength(content)).toBeLessThanOrEqual(10_000);

  // Only the context is bounded: what is on disk under $SUBFLOWS is the whole
  // answer, which is what "the agent reads the rest from `$SUBFLOWS`" needs.
  const run = at((await readdir(join(home, "runs"))).filter((entry) => !entry.endsWith(".lock")), 0);
  const answers = join(stageScratch(root, run, "01-parent"), "answers");
  await expect(readFile(join(answers, "2/output.txt"), "utf8")).resolves.toBe(LARGE);
  await expect(readFile(join(answers, "1/output.txt"), "utf8")).resolves.toBe(SMALL);
});

// LEG 3 — subflow.md:77-79 (the parent's `$PWD` crosses) and skills.md:27-50
// read through subflow.md:21 (a subflow's own `skills/` is a flow scope).
test("leg 3 — a child inherits the parent's $PWD, an explicit child workdir uses the run root, and subflow skills still flatten", async () => {
  const { root, home } = await scratch("bot-cli-subflow-inherit-");
  const base = join(home, "assemblies/review");
  const answer = join(base, "subflows/oracle/01-answer");
  const rootedAnswer = join(base, "subflows/rooted/01-answer");
  const workdir = join(root, "workdir");
  const parentWorkdir = join(workdir, "parent");
  const rootedWorkdir = join(workdir, "rooted");
  const skill = (parent: string, name: string, marker: string) =>
    mkdir(join(parent, "skills", name), { recursive: true }).then(() =>
      writeFile(join(parent, "skills", name, "SKILL.md"), `---\ndescription: ${marker}\n---\n${marker} body\n`));
  await Promise.all([mkdir(join(base, "flows/main"), { recursive: true }), mkdir(answer, { recursive: true }), mkdir(rootedAnswer, { recursive: true }), mkdir(parentWorkdir, { recursive: true }), mkdir(rootedWorkdir, { recursive: true })]);
  await Promise.all([
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nA review assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-parent.md"), `---\nworkdir: ./parent\n---\n${PARENT}\n`),
    writeFile(join(base, "subflows/oracle/FLOW.md"), "---\ndescription: think hard about one question\n---\n"),
    writeFile(join(answer, "STAGE.md"), "---\n---\nOraclechild answers.\n"),
    writeFile(join(answer, "success"), "#!/bin/sh\nprintf 'pwd=[%s]\\n' \"$PWD\"\nexit 0\n"),
    writeFile(join(base, "subflows/rooted/FLOW.md"), "---\ndescription: answer from a named root directory\n---\n"),
    writeFile(join(rootedAnswer, "STAGE.md"), "---\nworkdir: ./rooted\n---\nRootedchild answers.\n"),
    writeFile(join(rootedAnswer, "success"), "#!/bin/sh\nprintf 'pwd=[%s]\\n' \"$PWD\"\nexit 0\n"),
    skill(base, "house-style", "assembly house-style"),
    skill(base, "clash", "assembly clash"),
    skill(join(base, "subflows/oracle"), "clash", "oracle clash"),
    skill(join(base, "subflows/oracle"), "geology", "oracle geology"),
  ]);
  await Promise.all([chmod(join(answer, "success"), 0o755), chmod(join(rootedAnswer, "success"), 0o755)]);

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  const seen: Seen[] = [];
  queue(faux, router({
    [PARENT]: (round) => {
      if (round === 1) return callsSubflow([{ flow: "oracle", input: "the hard question" }, { flow: "rooted", input: "the rooted question" }]);
      if (round === 2) return writes("$OUTPUT", "parent answer");
      return fauxAssistantMessage("parent done");
    },
    "Oraclechild": (round) => (round === 1 ? writes("$OUTPUT", "oracle answer") : fauxAssistantMessage("child done")),
    "Rootedchild": (round) => (round === 1 ? writes("$OUTPUT", "rooted answer") : fauxAssistantMessage("child done")),
  }, seen), 16);

  await expect(main(["run", "start", "review/main", "--in", workdir, "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  const run = at((await readdir(join(home, "runs"))).filter((entry) => !entry.endsWith(".lock")), 0);
  const child = join(home, "runs", run, "stages/01-parent/1/1/subflows/1");
  const rootedChild = join(home, "runs", run, "stages/01-parent/1/1/subflows/2");
  await expect(readFile(join(child, "stages/01-answer/1/1/hooks/success.txt"), "utf8")).resolves.toBe(`pwd=[${parentWorkdir}]\n`);
  await expect(readFile(join(rootedChild, "stages/01-answer/1/1/hooks/success.txt"), "utf8")).resolves.toBe(`pwd=[${rootedWorkdir}]\n`);

  const childSkills = join(attempt(childRun(scratchRun(join(root, "cache"), home, run), "01-parent", 1), "01-answer"), "skills");
  await expect(readdir(childSkills)).resolves.toEqual(["clash", "geology", "house-style"]);
  await expect(readFile(join(childSkills, "clash/SKILL.md"), "utf8")).resolves.toContain("oracle clash");
  await expect(readFile(join(childSkills, "house-style/SKILL.md"), "utf8")).resolves.toContain("assembly house-style");

  const parentSkills = join(stageScratch(root, run, "01-parent"), "skills");
  await expect(readdir(parentSkills)).resolves.toEqual(["clash", "house-style"]);
  await expect(readFile(join(parentSkills, "clash/SKILL.md"), "utf8")).resolves.toContain("assembly clash");
});

const REFUSAL = "The oracle will not answer a question shaped like that.";

// LEG 4 — subflow.md:119-125 for a child that REFUSES (the fault case is at
// hostile-flow.test.ts:287-304), and subflow.md:147-149 for `bot runs`.
test("leg 4 — a refusing child does not fail the parent: the call carries the run cause vocabulary and the child's own reason, the folder keeps the input and no output, and `bot runs` lists the parent alone", async () => {
  const { root, home } = await scratch("bot-cli-subflow-refusal-");
  const base = join(home, "assemblies/review");
  await Promise.all([mkdir(join(base, "flows/main"), { recursive: true }), mkdir(join(base, "subflows/picky"), { recursive: true })]);
  await Promise.all([
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nA review assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-parent.md"), `---\n---\n${PARENT}\n`),
    writeFile(join(base, "subflows/picky/FLOW.md"), "---\ndescription: answer only what it can\n---\n"),
    writeFile(join(base, "subflows/picky/01-answer.md"), "---\n---\nPickychild answers.\n"),
  ]);

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  const seen: Seen[] = [];
  queue(faux, router({
    [PARENT]: (round) => {
      if (round === 1) return callsSubflow([{ flow: "picky", input: "the impossible question" }]);
      if (round === 2) return writes("$OUTPUT", "parent answer");
      return fauxAssistantMessage("parent done");
    },
    "Pickychild": () => fauxAssistantMessage([fauxToolCall("refuse", { reason: REFUSAL })], { stopReason: "toolUse" }),
  }, seen), 16);

  // "A child that fails or refuses does not fail the parent": exit 0, and the
  // parent's own output is what the run produced.
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("parent answer");

  const run = at((await readdir(join(home, "runs"))).filter((entry) => !entry.endsWith(".lock")), 0);
  const record = await events(join(home, "runs", run, "record.jsonl"));

  // "the same cause vocabulary as any run ... and the reason, in the child's
  // own words when it refused".
  const call = record.find((event) => event["event"] === "subflow_call");
  expect(call).toMatchObject({ call: 1, flow: "picky", started: true, exit: 1, cause: "refused", reason: REFUSAL });
  expect(CAUSES).toContain(call?.["cause"]);
  expect(record.find((event) => event["event"] === "run_end")).toMatchObject({ exit: 0, cause: "success" });

  // The child is a complete run of its own, ended honestly.
  const child = join(home, "runs", run, "stages/01-parent/1/1/subflows/1");
  expect((await events(join(child, "record.jsonl"))).find((event) => event["event"] === "run_end"))
    .toMatchObject({ exit: 1, cause: "refused" });

  // "The call's folder keeps the input and no output."
  const answers = join(stageScratch(root, run, "01-parent"), "answers");
  await expect(readdir(join(answers, "1"))).resolves.toEqual(["input.txt"]);

  // "`bot runs` lists top-level runs only, and a child is reached through its
  // parent": one line, the parent's, though two runs happened.
  const listOut: Buffer[] = [];
  const listErr: Buffer[] = [];
  const { held: lister } = realBoundary(root, home, listOut, listErr);
  await expect(main(["run", "list"], lister)).resolves.toBe(0);
  const lines = printedLines(Buffer.concat(listOut).toString().trimEnd().split("\n"));
  expect(lines).toHaveLength(3);
  expect(at(lines, 2)).toContain(`| ${run} |`);
  expect(Buffer.concat(listErr).toString()).toBe("");
});
