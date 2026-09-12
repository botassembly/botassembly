// Ticket 0076 — a handled fault must not leave a record that looks like a kill.
//
// Two endings were dishonest, in opposite directions:
//
// 1. A fault the runtime recognised and exited 2 for left NO `run_end` at all,
//    because `flow.ts` appended the ending on the normal return path and an
//    exception went round it. `inspection.ts` then read that record as
//    `crashed` — the same word an unhandled process death earns. The contract
//    is the other way round: "the run exits `2` and the record it had already
//    started says where" (runtime.md#exit-codes).
// 2. A subflow batch with one rejecting child threw before pushing ANY detail,
//    so siblings that ran, wrote their own records and produced output were
//    absent from the parent's — against subflow.md, "every call is one event
//    in the parent's record".
//
// The line this file pins, and the reason it is a line and not a catch
// (CHECKLIST 6): only an error the operating system reported — one carrying a
// failing `syscall` and an `errno` — is recognised. That is precisely the
// layer record.md names beneath a `fault` ("provider, disk, the agent
// library"). A programmer error carries neither and still escapes, unrecorded
// and unswallowed, which the paired tests below measure in both directions.
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import type { GatingSession } from "../src/flow.ts";
import { BOUNDARY_MS, CHILD_MS, spawned } from "./boundary.ts";
import { at, ensureTestInstallation, events, realBoundary, tempRoots } from "./cli-boundary.ts";
import { assembly, events as flowEvents, flow, roots, stage, start, writes, type Script } from "./flow-harness.ts";
import { outputOf } from "./hostile.ts";

const { scratch, cleanup } = tempRoots();
afterEach(async () => {
  await cleanup();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function oneStage(home: string): Promise<void> {
  const main_ = join(home, "assemblies/review/flows/main");
  await mkdir(main_, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(main_, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(main_, "01-work.md"), "---\n---\nDo the work.\n"),
  ]);
  ensureTestInstallation(home);
}

async function onlyRun(home: string): Promise<{ directory: string; record: Record<string, unknown>[] }> {
  const runs = join(home, "runs");
  const name = at((await readdir(runs)).filter((entry) => !entry.endsWith(".lock")), 0);
  const directory = join(runs, name);
  return { directory, record: await events(join(directory, "record.jsonl")) };
}

function ending(record: Record<string, unknown>[]): Record<string, unknown> | undefined {
  return record.find((event) => event["event"] === "run_end");
}

// ------------------------------------------------------------- leg 1 -------

// The shape ticket 0077 fixed one instance of and this one ends honestly: an
// awaited filesystem call one line after `createRecordWriter` returned. Each
// instance of it has been fixed in turn and the shape outlives them, so the
// fixture moves rather than the assertions: 0077's (a derived extension holding
// a slash) refuses at the preflight, and 0121's (an extension past NAME_MAX,
// 248 bytes, which this test used until then) refuses there too. This is the
// third reachable input — the LONGEST extension a name can hold, in a home deep
// enough that the run's own path carries `request.<ext>` past PATH_MAX. The run
// directory and `record.jsonl` are created and the request write then fails
// ENAMETOOLONG with the record already open, exactly as before. The two lengths
// are asserted below, because a home a little shallower would make this test
// pass by running normally.
const LONG = "b".repeat(247);
const PATH_MAX = 4096;
/** A home whose path is exactly `target` bytes, built from legal components. */
async function deepHome(root: string, target: number): Promise<string> {
  let path = join(root, "home");
  while (target - path.length > 201) path = join(path, "d".repeat(200));
  path = join(path, "d".repeat(Math.max(1, target - path.length - 1)));
  await mkdir(path, { recursive: true });
  return path;
}

test("leg 1: a disk fault one line after record birth ends the record, and the ending names where", async () => {
  const { root } = await scratch("bot-honest-birth-");
  const home = await deepHome(root, 4000);
  await oneStage(home);
  await writeFile(join(root, `t.${LONG}`), "the request\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);

  const code = await main(["run", "start", "review/main", `@t.${LONG}`], held);
  expect(code).toBe(2);

  // The record was BORN — the run directory and the first line exist — and the
  // process left with 2. Before this ticket that was the whole record.
  const { directory, record } = await onlyRun(home);
  // The construction, stated: the record's name fits and the request's does not.
  expect(join(directory, "record.jsonl").length).toBeLessThan(PATH_MAX);
  expect(join(directory, `request.${LONG}`).length).toBeGreaterThan(PATH_MAX);
  expect(at(record, 0)).toMatchObject({ event: "run_start" });
  expect(at(record, record.length - 1)).toMatchObject({ event: "run_end", exit: 2, cause: "fault" });

  // THE HONESTY ASSERTION, and it is a different falsification from "an ending
  // exists": the ending must say WHERE. A mutation that always writes a
  // generic ending — `reason: "The runtime failed."`, or dropping `reason`
  // from `runEndEvent` altogether — still satisfies every line above and
  // reddens all three of these. The reason names the errno, the syscall that
  // reported it, and the path it was reported for.
  const reason = String(ending(record)?.["reason"]);
  expect(reason).toContain("ENAMETOOLONG");
  expect(reason).toContain("open");
  expect(reason).toContain(join(directory, `request.${LONG}`));

  // And the run reads as what it was. `crashed` is what this record said
  // before — indistinguishable from a kill — so the listing is the second
  // reader that must now disagree with that.
  const listed: Buffer[] = [];
  const { held: reader } = realBoundary(root, home, listed, []);
  expect(await main(["run", "list"], reader)).toBe(0);
  expect(Buffer.concat(listed).toString()).toMatch(/\| 2 \| fault \|/u);
  expect(Buffer.concat(listed).toString()).not.toContain("crashed");

  // The person who ran it is told the same thing on stderr (runtime.md).
  expect(Buffer.concat(stderr).toString()).toContain("fault: ENAMETOOLONG");
});

// The second class the ticket names — session storage — and the one that lands
// INSIDE the flow rather than beside it, so the ending arrives after real
// stage events rather than instead of them.
const missingStore = (root: string) => async (): Promise<GatingSession> => {
  await readFile(join(root, "no-such-session-store", "sessions.jsonl"));
  throw new Error("unreachable: the read above always rejects");
};

test("leg 1: a session-storage fault inside the flow ends the run, after the stage it broke in", async () => {
  const { root, home } = await scratch("bot-honest-session-");
  await oneStage(home);
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, [], stderr);
  const code = await main(["run", "start", "review/main", "the request"], { ...held, createGating: missingStore(root) });
  expect(code).toBe(2);

  const { record } = await onlyRun(home);
  expect(record.map((event) => event["event"])).toEqual(["run_start", "run_end"]);
  const end = ending(record);
  expect(end).toMatchObject({ exit: 2, cause: "fault" });
  const reason = String(end?.["reason"]);
  expect(reason).toContain("ENOENT");
  expect(reason).toContain(join(root, "no-such-session-store", "sessions.jsonl"));
  expect(Buffer.concat(stderr).toString()).toContain("fault: ENOENT");
});

// ------------------------------------------------- the line, measured ------

// The twin of the storage fault above differs only in being bot's own error.
// The run has already started and knows which stage was being prepared, so the
// outer terminal boundary must preserve that information rather than letting
// the process-level catch print a message over an unsealed record.
const brokenGating = (): Promise<GatingSession> => Promise.reject(new TypeError("createGating is not a function"));

test("a bot error while preparing a stage seals the run with its stage and message", async () => {
  const { root, home } = await scratch("bot-honest-escape-");
  await oneStage(home);
  const { held } = realBoundary(root, home, [], []);

  expect(await main(["run", "start", "review/main", "the request"], { ...held, createGating: brokenGating })).toBe(2);

  const { record } = await onlyRun(home);
  const ends = record.filter((event) => event["event"] === "run_end");
  expect(ends).toHaveLength(1);
  const end = at(record, record.length - 1);
  expect(end).toMatchObject({ event: "run_end", stage: "01-work", retry: 1, exit: 2, cause: "fault" });
  expect(String(end["reason"])).toContain("createGating is not a function");

  // This remains a handled fault rather than a fabricated successful output.
  const listed: Buffer[] = [];
  const { held: reader } = realBoundary(root, home, listed, []);
  expect(await main(["run", "list"], reader)).toBe(0);
  expect(Buffer.concat(listed).toString()).toMatch(/\| 2 \| fault \|/u);
});

// ------------------------------------------------------- a real kill -------

const driver = fileURLToPath(new URL("./signal-driver.ts", import.meta.url));

async function until(probe: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + CHILD_MS;
  while (Date.now() < deadline) {
    if (probe()) return;
    await new Promise((resume) => setTimeout(resume, 20));
  }
  throw new Error(`never became true within ${String(CHILD_MS)}ms: ${what}`);
}

test("a SIGKILLed run reads as incomplete without inventing a terminal outcome", async () => {
  const { root, home } = await scratch("bot-honest-kill-");
  await oneStage(home);
  const marker = join(root, "in-the-turn");
  const { child, ended } = spawned([driver], {
    ...process.env, BOT_HOME: home, XDG_CACHE_HOME: join(root, "cache"), PWD: root,
    BOT_SIGNAL_MARKER: marker, BOT_SIGNAL_CWD: root, BOT_SIGNAL_LOCK: join(root, "lock-report"),
  });
  await until(() => existsSync(marker), "the child reached the agent's first turn");

  // SIGKILL cannot be handled (runtime.md): nothing runs on the way out, and
  // the lock is not released — it simply stops being refreshed.
  child.kill("SIGKILL");
  expect((await ended).signal).toBe("SIGKILL");

  const { directory, record } = await onlyRun(home);
  expect(at(record, 0)).toMatchObject({ event: "run_start" });
  expect(ending(record)).toBeUndefined();
  const lock = `${directory}.lock`;
  expect(existsSync(lock), "SIGKILL releases nothing").toBe(true);

  // The lock's timestamp is what decides, and staleness is the passage of
  // time, so the passage of time is what is applied — 60s past the 10s window
  // (inspection.ts), rather than a wait or a deleted lock.
  const stale = new Date(Date.now() - 60_000);
  await utimes(lock, stale, stale);

  const listed: Buffer[] = [];
  const { held: reader } = realBoundary(root, home, listed, []);
  expect(await main(["run", "list"], reader)).toBe(0);
  expect(Buffer.concat(listed).toString()).toContain("crashed");
}, BOUNDARY_MS);

// ------------------------------------------------------------- leg 2 -------

test("leg 2: a rejected subflow child no longer discards a fulfilled sibling's detail", async () => {
  const alpha = flow("alpha", "subflows/alpha", [stage("subflows/alpha/01-answer.md", "answer")]);
  const beta = flow("beta", "subflows/beta", [stage("subflows/beta/01-answer.md", "answer")]);
  const gamma = flow("gamma", "subflows/gamma", [stage("subflows/gamma/01-answer.md", "answer")]);
  const main_ = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  // `beta` and `gamma` are given no script, so the harness's own factory
  // rejects for them — a rejection past `runOne`'s input seam, which is the
  // case the ticket names. It is deliberately NOT an operating-system error:
  // this leg is about evidence surviving a rejection, whatever it was. TWO of
  // them, because the batch remembers only the first to rethrow it: with one,
  // an event for "the failure" and an event per failed call cannot be told
  // apart, and the measurement could not have gone the other way.
  const scripts = new Map<string, Script>([
    ["alpha:01-answer:1", writes("alpha answer")],
    ["main:01-parent:1", (context) => [
      fauxAssistantMessage([fauxToolCall("subflow", {
        calls: [{ flow: "alpha", input: "a" }, { flow: "beta", input: "b" }, { flow: "gamma", input: "c" }],
      })], { stopReason: "toolUse" }),
      async () => { await writeFile(outputOf(context), "parent"); return fauxAssistantMessage("done"); },
    ]],
  ]);
  const scope = new Map([["alpha", alpha], ["beta", beta], ["gamma", gamma]]);
  const run = await start(main_, assembly(main_, scope), scripts);
  await run.result;
  const record = await flowEvents(run.writer.writer.recordPath);

  // The sibling ran, wrote its own record and produced output — and is in the
  // parent's record, where subflow.md says every call belongs. Before ticket
  // 0076 the first rejection threw before ANY detail was pushed, so this event
  // did not exist and the parent's record omitted a call it made.
  //
  // A rejected child is not an ending, but both children wrote `run_start`.
  // The parent must therefore say they started without inventing an ending.
  const calls = record.filter((event) => event["event"] === "subflow_call");
  expect(calls).toEqual([
    expect.objectContaining({ flow: "alpha", call: 1, started: true, exit: 0, cause: "success" }),
    expect.objectContaining({ flow: "beta", call: 2, started: true, reason: "No faux script for beta:01-answer:1" }),
    expect.objectContaining({ flow: "gamma", call: 3, started: true, reason: "No faux script for gamma:01-answer:1" }),
  ]);
  for (const rejected of calls.slice(1)) {
    expect([rejected["cause"], rejected["exit"]]).toEqual([undefined, undefined]);
    const child = String(rejected["child"]);
    expect(await readFile(join(run.writer.writer.runDirectory, child, "record.jsonl"), "utf8")).toContain("run_start");
  }

  // The settled child's evidence names its complete child record.
  const child = String(at(calls, 0)["child"]);
  expect(await readFile(join(run.writer.writer.runDirectory, child, "record.jsonl"), "utf8")).toContain("run_end");
});

// Ticket 0123 (C8), the other side of the same coin. The rejections that escape
// `runOne` are not all alike: some happen before the child exists, and one
// class happens AFTER it ran, wrote its record and was sealed — carrying its
// answer back into `$SUBFLOWS` is the last thing the call does. Recording that
// call as one that did not start would be a record saying what did not happen,
// with the child's complete run sitting on disk next to the claim. So the
// output copy is a seam like the input one: the call's outcome is the child's
// real ending, and the reason says the answer could not be carried back.
//
// EISDIR, not a permission bit or a race: `output.txt` is a DIRECTORY where the
// copy must write a file, made before the tool call is ever issued. Deterministic,
// and it needs no root, no chmod and no timing.
test("a subflow whose answer cannot be carried back is recorded as the started call it was", async () => {
  const helper = flow("helper", "subflows/helper", [stage("subflows/helper/01-answer.md", "answer")]);
  const main_ = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  const scripts = new Map<string, Script>([
    ["helper:01-answer:1", writes("helper answer")],
    ["main:01-parent:1", (context) => [
      async () => {
        await mkdir(join(context.subflowsPath, "1", "output.txt"), { recursive: true });
        return fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "helper", input: "a" }] })], { stopReason: "toolUse" });
      },
      async () => { await writeFile(outputOf(context), "parent"); return fauxAssistantMessage("done"); },
    ]],
  ]);
  const run = await start(main_, assembly(main_, new Map([["helper", helper]])), scripts);
  await run.result;
  const record = await flowEvents(run.writer.writer.recordPath);

  const call = at(record.filter((event) => event["event"] === "subflow_call"), 0);
  expect(call).toMatchObject({ flow: "helper", call: 1, started: true, exit: 0, cause: "success" });
  expect(String(call["reason"])).toContain("EISDIR");
  // The child really did run, which is what makes `started: false` here a lie.
  expect(await readFile(join(run.writer.writer.runDirectory, String(call["child"]), "record.jsonl"), "utf8")).toContain("run_end");
});
