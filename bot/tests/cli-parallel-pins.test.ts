// Ticket 0151 — the PARALLEL pins the survey found loose, in the shape 0056
// gave subflows: end to end through the REAL `main(["run", "start", ...])` with the faux
// provider (the cli-* idiom), so what is witnessed is the runtime's own.
//
// What was ALREADY pinned, and is therefore not repeated here: the same input
// reaching every branch and the fan-in in name order (cli-fanout-handoff.test
// .ts:57), the branch NAME being the key whatever the producing stage was
// called (cli-parallel-branch-naming.test.ts:79), dispatch in name order and
// the started settlements after a failure (flow.test.ts:129), a hung branch at
// its stage timeout (hostile-flow.test.ts:155), the width ceiling at 32 and its
// refusal at 33 (ceiling-fanout.test.ts:46), and every static container fault
// (the conformance corpus: refuse/body-unexpected, branch-numbered,
// folder-empty-*, tail-container, loop-nested).
//
// What was loose, and is what this file is for. Every existing fan-in fixture
// either runs at `width: 1` — where finish order and name order are the same
// string — or ends with every branch succeeding, so:
// - parallel.md "Width": "the recorded order of branches never implies the
//   order they finished in", witnessed with the finish order REVERSED.
// - parallel.md "When a branch fails": the exit is "the one from the first
//   failing branch in name order", again with the finish order reversed; the
//   running siblings finish and their outputs are kept; branches that had not
//   started do not start.
// - slots.md: "`$INPUT`, `$OUTPUT`, and `$TMP` belong to the runtime, one set
//   per stage, and no two stages share them" — against "`$PWD` is one tree".
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "./initialized-cli.ts";
import {
  at, events, queue, realBoundary, received, router, runsIn, sealedOutput, start, tempRoots, tree, writes,
  type Message,
} from "./cli-boundary.ts";

const { scratch, cleanup } = tempRoots();
afterEach(async () => { await cleanup(); });

const ASSEMBLY = "---\nintelligence: default\n---\nReview assembly.\n";
const PREPARE = "Preparemarker: prepare the material.";
const ALPHA = "Alphamarker: assess one way.";
const BETA = "Betamarker: assess the other way.";
const GAMMA = "Gammamarker: assess a third way.";
const REPORT = "Reportmarker: report over the branches.";
const JOIN = "Joinmarker: keep the loop body stage-shaped.";
const REFUSAL = "the material contradicts itself";

/** Stage, PARALLEL, stage — `names` branches, each a single stage file. */
async function fan(home: string, names: string[], width?: number): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  const assess = join(flow, "02-assess");
  await mkdir(assess, { recursive: true });
  const bodies: Record<string, string> = { alpha: ALPHA, beta: BETA, gamma: GAMMA };
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), ASSEMBLY),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-prepare.md"), `---\n---\n${PREPARE}\n`),
    writeFile(join(assess, "PARALLEL.md"), width === undefined ? "---\n---\n" : `---\nwidth: ${String(width)}\n---\n`),
    writeFile(join(flow, "03-report.md"), `---\n---\n${REPORT}\n`),
    ...names.map((name) => writeFile(join(assess, `${name}.md`), `---\n---\n${bodies[name] ?? name}\n`)),
  ]);
}

const done = (text: string) => (round: number): Message =>
  round === 1 ? writes("$OUTPUT", text) : fauxAssistantMessage("done");

/** A LOOP needs a stage after its PARALLEL body, because the graph deliberately
 * refuses a container as a sequence tail. */
async function loopedFan(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  const cycle = join(flow, "01-cycle");
  const assess = join(cycle, "01-assess");
  await mkdir(assess, { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), ASSEMBLY),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(cycle, "LOOP.md"), "---\nrepeat: 2\n---\n"),
    writeFile(join(assess, "PARALLEL.md"), "---\n---\n"),
    writeFile(join(assess, "alpha.md"), `---\n---\n${ALPHA}\n`),
    writeFile(join(assess, "beta.md"), `---\n---\n${BETA}\n`),
    writeFile(join(cycle, "02-join.md"), `---\n---\n${JOIN}\n`),
    writeFile(join(flow, "02-report.md"), `---\n---\n${REPORT}\n`),
  ]);
}

/** Yield until the run's record holds what a branch is waiting for. The record
 *  is the one seam both branches share, so this makes the finish ORDER a fact
 *  of construction rather than of timing — the lesson flow.test.ts:101-128
 *  wrote down after a sleep-built parallel fixture flaked. */
async function untilRecorded(home: string, probe: (record: Record<string, unknown>[]) => boolean): Promise<void> {
  for (let turn = 0; turn < 20_000; turn += 1) {
    const runs = await runsIn(home).then((names) => names, () => []);
    const name = runs[0];
    if (name !== undefined) {
      const held = await events(join(home, "runs", name, "record.jsonl")).then((lines) => lines, () => []);
      if (probe(held)) return;
    }
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  throw new Error("untilRecorded: the record never showed it");
}

const ended = (stage: string) => (record: Record<string, unknown>[]): boolean =>
  record.some((event) => event["event"] === "stage_end" && event["stage"] === stage);

test("a PARALLEL's results land in name order however the branches finished: beta first on the clock, alpha first everywhere it is written down", async () => {
  const { root, home } = await scratch("bot-cli-parallel-finish-");
  await fan(home, ["alpha", "beta"]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  queue(faux, router({
    [PREPARE]: done("the material"),
    // alpha may not write until beta's whole stage is over, so beta finishes
    // FIRST — the reverse of name order, by construction.
    [ALPHA]: async (round) => {
      if (round !== 1) return fauxAssistantMessage("done");
      await untilRecorded(home, ended("02-assess/beta"));
      return writes("$OUTPUT", "alpha view");
    },
    [BETA]: done("beta view"),
    [REPORT]: done("the report"),
  }), 16);

  expect(await main(["run", "start", "review/main", "the request"], held)).toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the report");

  const record = await events(join(home, "runs", at(await runsIn(home), 0), "record.jsonl"));
  // The premise, measured rather than assumed: beta really did end first. If
  // this ever reads alpha-then-beta the test below is vacuous, not passing.
  expect(record.filter((event) => event["event"] === "stage_end" && String(event["stage"]).startsWith("02-assess/"))
    .map((event) => event["stage"])).toEqual(["02-assess/beta", "02-assess/alpha"]);

  // THE PIN. parallel.md "Width": "the recorded order of branches never implies
  // the order they finished in" — and invariant 41 puts the fan-in in name
  // order. Both are the OPPOSITE of the order above.
  const alpha = sealedOutput(record, "02-assess/alpha");
  const beta = sealedOutput(record, "02-assess/beta");
  expect(received(start(record, "03-report"))).toEqual([
    { name: "alpha.txt", path: alpha.path, sha256: alpha.sha256 },
    { name: "beta.txt", path: beta.path, sha256: beta.sha256 },
  ]);
  expect(record.filter((event) => event["event"] === "parallel_done")).toEqual([expect.objectContaining({
    stage: "02-assess",
    concurrent: 2,
    branches: [
      { branch: "alpha", started: true, exit: 0, cause: "success" },
      { branch: "beta", started: true, exit: 0, cause: "success" },
    ],
  })]);
});

// parallel.md "When a branch fails": "When more than one branch failed, the
// exit code is the one from the first failing branch in name order. Name order
// is chosen because it is the same before the run as after it: completion order
// would make the exit code depend on timing." So the two branches here fail
// with DIFFERENT exit codes, and the one that fails first on the clock is the
// one whose code must NOT be the run's.
test("a PARALLEL inside a LOOP records each completion under its repeat", async () => {
  const { root, home } = await scratch("bot-cli-looped-parallel-identity-");
  await loopedFan(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  const perRepeat = (text: string) => (round: number): Message =>
    round % 2 === 1 ? writes("$OUTPUT", text) : fauxAssistantMessage("done");
  queue(faux, router({
    [ALPHA]: perRepeat("alpha view"),
    [BETA]: perRepeat("beta view"),
    [JOIN]: perRepeat("joined"),
    [REPORT]: done("the report"),
  }), 14);

  expect(await main(["run", "start", "review/main", "the request"], held)).toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the report");

  const record = await events(join(home, "runs", at(await runsIn(home), 0), "record.jsonl"));
  const parallelDone = record.filter((event) => event["event"] === "parallel_done");
  // The ending of each fan-out has the same three identity fields as the
  // stages beneath it. Without repeat, these two otherwise identical endings
  // cannot tell a record reader which loop pass they completed.
  expect(parallelDone.map((event) => ({ stage: event["stage"], repeat: event["repeat"], retry: event["retry"] }))).toEqual([
    { stage: "01-cycle/01-assess", repeat: 1, retry: 1 },
    { stage: "01-cycle/01-assess", repeat: 2, retry: 1 },
  ]);

  // `loop_done` ends the loop itself, not work inside one of its passes. Its
  // `repeats` field already says how many passes it encompassed, so no repeat
  // identity exists for it to claim.
  const loopDone = record.filter((event) => event["event"] === "loop_done");
  expect(loopDone).toEqual([expect.objectContaining({ stage: "01-cycle", retry: 1, repeats: 2, ended_by: "limit" })]);
  expect(loopDone[0]).not.toHaveProperty("repeat");
});

test("two failing branches: the run takes the first failing branch's ending in NAME order, not the one that failed first", async () => {
  const { root, home } = await scratch("bot-cli-parallel-exit-");
  await fan(home, ["alpha", "beta"]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  queue(faux, router({
    [PREPARE]: done("the material"),
    // alpha faults — exit 2 — but only after beta has already refused, exit 1.
    [ALPHA]: async () => {
      await untilRecorded(home, ended("02-assess/beta"));
      return fauxAssistantMessage("", { stopReason: "error", errorMessage: "the provider fell over" });
    },
    [BETA]: () => fauxAssistantMessage([fauxToolCall("refuse", { reason: REFUSAL })], { stopReason: "toolUse" }),
    [REPORT]: done("never"),
  }), 12);

  // Alpha's 2, not beta's 1, though beta's is the one that existed first.
  expect(await main(["run", "start", "review/main", "the request"], held)).toBe(2);
  expect(Buffer.concat(stdout).toString()).toBe("");
  expect(Buffer.concat(stderr).toString()).toBe("fault: the provider fell over\n");

  const record = await events(join(home, "runs", at(await runsIn(home), 0), "record.jsonl"));
  expect(record.filter((event) => event["event"] === "stage_end" && String(event["stage"]).startsWith("02-assess/"))
    .map((event) => [event["stage"], event["exit"], event["cause"]]))
    .toEqual([["02-assess/beta", 1, "refused"], ["02-assess/alpha", 2, "fault"]]);
  // Both endings are in the record — the run kept beta's, it just did not take
  // it (record.md "For each container": "which branches of a PARALLEL ran").
  expect(record.filter((event) => event["event"] === "parallel_done")).toEqual([expect.objectContaining({
    branches: [
      { branch: "alpha", started: true, exit: 2, cause: "fault" },
      { branch: "beta", started: true, exit: 1, cause: "refused" },
    ],
  })]);
  expect(record.filter((event) => event["event"] === "run_end"))
    .toEqual([expect.objectContaining({ exit: 2, cause: "fault" })]);
  expect(record.filter((event) => event["stage"] === "03-report")).toEqual([]);
});

test("a failed branch fails the stage, the sibling still running is allowed to finish and its output is kept, and the branch that had not started does not start", async () => {
  const { root, home } = await scratch("bot-cli-parallel-failing-");
  await fan(home, ["alpha", "beta", "gamma"], 2);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  queue(faux, router({
    [PREPARE]: done("the material"),
    // alpha holds its slot until beta has failed, so no slot is ever free for
    // gamma while the pool is still dispatching (pool.ts reads `stop` before
    // it takes another item). Nothing here is timed.
    [ALPHA]: async (round) => {
      if (round !== 1) return fauxAssistantMessage("done");
      await untilRecorded(home, ended("02-assess/beta"));
      return writes("$OUTPUT", "alpha view");
    },
    [BETA]: () => fauxAssistantMessage([fauxToolCall("refuse", { reason: REFUSAL })], { stopReason: "toolUse" }),
    // Routed so that a gamma that DID start fails loudly rather than quietly
    // answering: the assertion below would otherwise be a tautology.
    [GAMMA]: () => { throw new Error("gamma must not start"); },
    [REPORT]: done("never"),
  }), 12);

  // "The parallel stage fails" — with the one failing branch's ending, relayed.
  expect(await main(["run", "start", "review/main", "the request"], held)).toBe(1);
  expect(Buffer.concat(stdout).toString()).toBe("");
  expect(Buffer.concat(stderr).toString()).toBe(`refused: ${REFUSAL}\n`);

  const run = at(await runsIn(home), 0);
  const record = await events(join(home, "runs", run, "record.jsonl"));
  // "Branches already running are allowed to finish first, and their outputs
  // are kept in the run even though nothing downstream reads them."
  const alpha = sealedOutput(record, "02-assess/alpha");
  expect(alpha.path).toBe("stages/02-assess/alpha/1/1/output.txt");
  await expect(readFile(join(home, "runs", run, alpha.path), "utf8")).resolves.toBe("alpha view");
  expect(record.filter((event) => event["stage"] === "03-report")).toEqual([]);

  // "Branches that had not started do not start." Deterministic here because a
  // slot could only free after the failure that closed the pool.
  expect(record.filter((event) => event["event"] === "parallel_done")).toEqual([expect.objectContaining({
    stage: "02-assess",
    width: 2,
    branches: [
      { branch: "alpha", started: true, exit: 0, cause: "success" },
      { branch: "beta", started: true, exit: 1, cause: "refused" },
      { branch: "gamma", started: false },
    ],
  })]);
  expect(start(record, "02-assess/gamma")).toBeUndefined();
  expect(existsSync(join(home, "runs", run, "stages/02-assess/gamma"))).toBe(false);
});

test("branches share one $PWD and leave no $TMP files after settlement", async () => {
  const { root, home } = await scratch("bot-cli-parallel-slots-");
  await fan(home, ["alpha", "beta"]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  // Three writes per branch, then the turn that ends it: its own scratch, the
  // shared tree, its output. The scratch file's NAME is the same on both sides
  // — `mine.txt` — so two of them can only exist in two directories. Capture
  // each `$TMP` path in the shared worktree while the branch is still live;
  // cleanup must remove the file but cannot make the two paths collide.
  const branch = (name: string) => (round: number): Message => {
    if (round === 1) return fauxAssistantMessage([fauxToolCall("bash", { command: `printf '%s' "$TMP" > "$PWD/${name}-tmp-path.txt"; printf '%s' '${name} kept this' > "$TMP/mine.txt"` })], { stopReason: "toolUse" });
    if (round === 2) return writes(`$PWD/${name}-was-here.txt`, `${name} worked here`);
    if (round === 3) return writes("$OUTPUT", `${name} view`);
    return fauxAssistantMessage("done");
  };
  queue(faux, router({
    [PREPARE]: done("the material"),
    [ALPHA]: branch("alpha"),
    [BETA]: branch("beta"),
    [REPORT]: done("the report"),
  }), 20);

  expect(await main(["run", "start", "review/main", "the request"], held)).toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  // slots.md "`$PWD`": "Several runs, and several branches of one run, can be
  // working in the same tree at the same time" — one tree, both branches in it,
  // and this specification "does not pretend otherwise" (parallel.md).
  await expect(readFile(join(root, "alpha-was-here.txt"), "utf8")).resolves.toBe("alpha worked here");
  await expect(readFile(join(root, "beta-was-here.txt"), "utf8")).resolves.toBe("beta worked here");
  const tmpPaths = await Promise.all(["alpha", "beta"].map((name) => readFile(join(root, `${name}-tmp-path.txt`), "utf8")));
  expect(new Set(tmpPaths).size).toBe(2);

  // Each branch owned a separate `$TMP` while it worked. Both directories now
  // settled, so neither branch's disposable file remains in retained scratch.
  const cache = join(root, "cache");
  const scratches = (await tree(cache)).filter((path) => path.endsWith("/mine.txt"));
  expect(scratches).toEqual([]);
  // And nothing of either branch's scratch reached the run's own directory.
  const run = join(home, "runs", at(await runsIn(home), 0));
  expect((await tree(run)).filter((path) => path.endsWith("mine.txt"))).toEqual([]);
  expect(await readdir(join(run, "stages/02-assess"))).toEqual(expect.arrayContaining(["alpha", "beta"]));
});
