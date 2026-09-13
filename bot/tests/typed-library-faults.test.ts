// Ticket 0082 — the agent library's own faults are the ones the runtime could
// not recognise.
//
// 0076 recognised a machinery failure by ONE shape: a `syscall` string beside a
// numeric `errno`, which is a direct operating-system error. It is not the
// shape the agent library throws, and record.md names that library explicitly
// beside the disk as a cause of `fault` ("the machinery failed — ... (provider,
// disk, the agent library)"). `normalizeHarnessError` re-wraps every error
// leaving the harness into one of six published classes, which carry `name` and
// a `code` from a closed enum and carry the errno pair no higher than `cause`.
// So the plainest fault there is — a permission that changes mid-run — left a
// record that stopped mid-sentence and the word `crashed`, which is what a
// SIGKILL earns (`honest-endings.test.ts` pins that word for a real kill).
//
// Both legs below are the REAL runtime — real `AgentHarness`, real
// `JsonlSessionStorage`, real gating, `main(["run", "start", ...])` with nothing stubbed
// but the model — and the only intervention is `chmod` on a path the runtime
// itself chose. Nothing here stubs the recognition point.
//
// The line this file pins, and why it is a line and not a catch (CHECKLIST 6):
// a `code` is only trustworthy when the library set it from a typed cause.
// `AgentHarnessError` is the wrapper round EVERYTHING leaving the harness, so
// `unknown` and `hook` are what it gives an error thrown by this runtime's own
// callbacks, and `busy`/`invalid_state`/`invalid_argument` are it saying the
// runtime called it wrong. Recognising those would launder a programmer error
// into an ending. The last two tests measure that in both directions.
import { BranchSummaryError, CompactionError, ExecutionError, FileError, HarnessFault, SessionInvariantError } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { machineryFault } from "../src/model.ts";
import { at, events, realBoundary, tempRoots } from "./cli-boundary.ts";
import { assembly, events as flowEvents, flow, roots, stage, start, type Script } from "./flow-harness.ts";
import { outputOf } from "./hostile.ts";

const { scratch, cleanup } = tempRoots();
// A directory left 0555 cannot have its children unlinked, so what the test
// made read-only it makes writable again before anything tries to remove it.
const readonly: string[] = [];
afterEach(async () => {
  await Promise.all(readonly.splice(0).map((path) => chmod(path, 0o755).catch(() => undefined)));
  await cleanup();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function onlyRun(home: string): Promise<{ name: string; record: Record<string, unknown>[] }> {
  const runs = join(home, "runs");
  const name = at((await readdir(runs)).filter((entry) => !entry.endsWith(".lock")), 0);
  return { name, record: await events(join(runs, name, "record.jsonl")) };
}

function ending(record: Record<string, unknown>[]): Record<string, unknown> | undefined {
  return record.find((event) => event["event"] === "run_end");
}

async function listing(root: string, home: string): Promise<string> {
  const listed: Buffer[] = [];
  const { held } = realBoundary(root, home, listed, []);
  expect(await main(["run", "list"], held)).toBe(0);
  return Buffer.concat(listed).toString();
}

// --------------------------------------------------------------- leg 1 ------

// The ticket's reproduction, and the shape the driver's verifier measured:
//   AgentHarnessError | code: session
//     cause[0]: SessionError | code: storage
//     cause[1]: FileError    | code: permission_denied
//     cause[2]: Error        | code: EACCES | syscall: open | errno: -13
// A real errno error three levels down, with the top level stripped of both
// `syscall` and `errno` by the library. It escapes `harness.setActiveTools`
// (turns.ts), which is the harness call the loop's question makes AROUND the
// agent loop — not inside it.
//
// The gate is what changes the permission: it is an ordinary assembly
// executable, it runs after the output passed and before the loop asks its
// question, and it makes read-only the one file the runtime named in its own
// record (`session: stages/.../session.jsonl`).
test("leg 1: a session file that goes read-only mid-run ends the record and names the library class", async () => {
  const { root, home } = await scratch("bot-typed-loop-");
  const work = join(home, "assemblies/review/flows/main/01-refine/01-work");
  await mkdir(work, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(home, "assemblies/review/flows/main/01-refine/LOOP.md"), "---\nrepeat: 3\n---\nIs the draft ready?\n"),
    writeFile(join(home, "assemblies/review/flows/main/02-final.md"), "---\n---\nFinish.\n"),
    writeFile(join(work, "STAGE.md"), "---\n---\nDo the work.\n"),
    writeFile(join(work, "gate"), `#!/bin/sh\nfind ${join(home, "runs")} -name session.jsonl -exec chmod 0444 {} +\nexit 0\n`),
  ]);
  await chmod(join(work, "gate"), 0o755);

  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, [], stderr);
  faux.setResponses([
    () => fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "one" })], { stopReason: "toolUse" }),
    () => fauxAssistantMessage("done"),
    () => fauxAssistantMessage("done"),
  ]);
  expect(await main(["run", "start", "review/main", "the request"], held)).toBe(2);

  const { name, record } = await onlyRun(home);
  const session = join(home, "runs", name, "stages/01-refine/01-work/1/session.jsonl");
  readonly.push(session);

  // Before this ticket the record stopped at the gate's `check` event and the
  // exception escaped `main()` — no ending at all.
  expect(at(record, record.length - 1)).toMatchObject({ event: "run_end", exit: 2, cause: "fault" });

  // THE HONESTY ASSERTION, and a different falsification from "an ending
  // exists": the ending says WHERE. A mutation that returned a constant reason
  // — or dropped `reason` — satisfies the line above and reddens all of these.
  // The pair that IS the recognition comes back first, then the sentence the
  // library composed, which names the file.
  const reason = String(ending(record)?.["reason"]);
  expect(reason).toContain("HarnessFault");
  expect(reason).toContain("EACCES");
  expect(reason).toContain(session);

  // And the run reads as what it was. `crashed` is what it said before, which
  // is the word `honest-endings.test.ts` pins for a SIGKILL.
  const listed = await listing(root, home);
  expect(listed).toMatch(/\| 2 \| fault \|/u);
  expect(listed).not.toContain("crashed");
  expect(Buffer.concat(stderr).toString()).toContain("fault: HarnessFault");
});

// --------------------------------------------------------------- leg 2 ------

// A second, different reproduction of the same premise, reaching the recognition
// point by another road: the failure is raised by `JsonlSessionStorage.create`
// inside `createGating`, so there is no `AgentHarnessError` wrapper at all and
// the top-level class is one of the five leaves.
//   SessionError | code: storage
//     cause[0]: FileError | code: permission_denied
// Note there is no errno level here AT ALL — the chain ends at `FileError` —
// which is the measured reason the reported reason does not walk `cause`.
test("leg 2: a run directory that goes read-only between stages faults on the leaf class, with no wrapper", async () => {
  const { root, home } = await scratch("bot-typed-create-");
  const flows = join(home, "assemblies/review/flows/main");
  await mkdir(flows, { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flows, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flows, "01-work.md"), "---\n---\nDo the work.\n"),
    writeFile(join(flows, "02-again.md"), "---\n---\nDo it again.\n"),
  ]);
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, [], stderr);
  faux.setResponses([
    async () => {
      // Mid-run, from inside the first stage's turn: the run's own stage tree
      // stops accepting new directories, so the SECOND stage cannot be given
      // the session file the runtime already chose a path for.
      const runs = join(home, "runs");
      const stages = join(runs, at((await readdir(runs)).filter((entry) => !entry.endsWith(".lock")), 0), "stages");
      readonly.push(stages);
      await chmod(stages, 0o555);
      return fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "one" })], { stopReason: "toolUse" });
    },
    () => fauxAssistantMessage("done"),
  ]);
  expect(await main(["run", "start", "review/main", "the request"], held)).toBe(2);

  const { record } = await onlyRun(home);
  // The first stage ran and ended honestly; the run ends where the machinery
  // did, rather than falling silent after a stage that succeeded.
  expect(record.map((event) => event["event"])).toContain("stage_end");
  const reason = String(ending(record)?.["reason"]);
  expect(ending(record)).toMatchObject({ exit: 2, cause: "fault" });
  expect(reason).toContain("EACCES mkdir");
  expect(reason).toContain("stages/02-again");
  expect(await listing(root, home)).toMatch(/\| 2 \| fault \|/u);
});

// ------------------------------------------------------- the line, measured --

// The live failure's shape, through the real library rather than a fixture.
// The `before` hook makes the session file read-only after the harness has
// already written to it, so failure reporting inside `harness.prompt` itself
// fails and pi launders the result as `unknown`. Bot cannot classify the
// library's subtype, but it still controls the process and must seal the run.
test("an unknown harness failure seals the run and bot show reports its fault", async () => {
  const { root, home } = await scratch("bot-typed-unknown-");
  const stage_ = join(home, "assemblies/review/flows/main/01-work");
  await mkdir(stage_, { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage_, "STAGE.md"), "---\n---\nDo the work.\n"),
    writeFile(join(stage_, "before"), `#!/bin/sh\nfind ${join(home, "runs")} -name session.jsonl -exec chmod 0444 {} +\nexit 0\n`),
  ]);
  await chmod(join(stage_, "before"), 0o755);
  const { held, faux } = realBoundary(root, home, [], []);
  faux.setResponses([() => fauxAssistantMessage("done")]);

  expect(await main(["run", "start", "review/main", "the request"], held)).toBe(2);

  const { name, record } = await onlyRun(home);
  readonly.push(join(home, "runs", name, "stages/01-work/1/session.jsonl"));
  // The terminal names the stage bot was running, the exit it chose, and the
  // message the harness gave it. Without the outer boundary, the last line is
  // a turn and every assertion here fails.
  expect(at(record, record.length - 1)).toMatchObject({
    event: "run_end", stage: "01-work", retry: 1, exit: 2, cause: "fault",
  });
  const reason = String(ending(record)?.["reason"]);
  expect(reason).toContain("HarnessFault");
  expect(reason).toContain("EACCES");
  expect(reason).toContain(join(home, "runs", name, "stages/01-work/1/session.jsonl"));

  // `show` reads the sealed ending instead of treating the record as a live or
  // crashed run that happened to stop after the turn.
  const shown: Buffer[] = [];
  const { held: reader } = realBoundary(root, home, shown, []);
  expect(await main(["run", "events", name], reader)).toBe(0);
  expect(Buffer.concat(shown).toString()).toContain("run_end  01-work/1  exit 2, fault");
});

// The other direction of the same line, measured against the library's REAL
// classes rather than hand-built lookalikes. Every `unknown` below is the
// library's own "could not classify"; `BranchSummaryError` is absent from this
// list because `BranchSummaryErrorCode` has no `unknown` member at all, so the
// exclusion is a no-op for it — the fifth enum needed nothing.
const laundered = [
  new HarnessFault("boom", new TypeError("a tool callback threw")),
  new SessionInvariantError("boom"),
  new FileError("unknown", "boom", "/p"),
  new ExecutionError("unknown", "boom"),
];

// The ordinary error shapes the driver's verifier measured against the pair.
// None carries any of the six names, and two of them carry a string `code` —
// which is why "has a string code" alone would be a net.
const ordinary: unknown[] = [
  new Error("plain"), new TypeError("t"), new RangeError("r"), new SyntaxError("s"),
  new AggregateError([new Error("a")], "agg"),
  Object.assign(new TypeError("t"), { code: "ERR_INVALID_ARG_TYPE" }),
  Object.assign(new Error("a"), { code: "ERR_ASSERTION" }),
  { name: "SessionError" }, { code: "storage" }, { name: "SessionError", code: 7 },
  "SessionError storage", undefined, null,
];

test("the pair is the lock: the library's machinery codes are recognised, its laundering codes are not", () => {
  for (const value of laundered) { const code = "code" in value ? value.code : undefined; expect([value.name, code, machineryFault(value)]).toEqual([value.name, code, undefined]); }
  for (const value of ordinary) expect(machineryFault(value)).toBeUndefined();

  // And the recognised side, which is what leg 1 and leg 2 arrive at. The three
  // `AgentHarnessError` codes below are the only ones the library ever sets
  // from a typed cause; the leaves are recognised on any code but `unknown`.
  expect(machineryFault(new FileError("permission_denied", "denied", "/p"))).toBe("FileError permission_denied: denied");
  expect(machineryFault(new ExecutionError("timeout", "timed out"))).toBe("ExecutionError timeout: timed out");
  expect(machineryFault(new CompactionError("aborted", "aborted"))).toBe("CompactionError aborted: aborted");
  expect(machineryFault(new BranchSummaryError("summarization_failed", "bad"))).toBe("BranchSummaryError summarization_failed: bad");

  // 0076's rule is untouched, including the direct errno error that reaches
  // this function with no library wrapper round it at all.
  expect(machineryFault(Object.assign(new Error("x"), { code: "EACCES", syscall: "open", errno: -13, path: "/p" }))).toBe("EACCES open /p");
  expect(machineryFault(Object.assign(new Error("x"), { syscall: "open", errno: -13 }))).toBe("EUNKNOWN open");
});

// ------------------------------------------------ what did NOT change -------

// The ticket's refutation, kept: the hole is failures raised by the harness
// AROUND the agent loop, not inside it. A programmer error thrown by this
// runtime's own tool callback never reaches the recognition point at all — pi's
// agent loop contains it and hands it back to the agent as a failed tool
// result, so the run continues and ends `0/success`. That is measured here
// rather than assumed, because a fix that started recognising things inside the
// loop would be fixing something that works. (A provider failure inside the
// turn is likewise already honest: `hostile-flow.test.ts` and
// `hostile-gating.test.ts` pin `2/fault` with a full record for it.)
test("the refutation: a TypeError from a tool callback is contained by the agent loop and never reaches the recognition point", async () => {
  const alpha = flow("alpha", "subflows/alpha", [stage("subflows/alpha/01-answer.md", "answer")]);
  const parent = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  const scripts = new Map<string, Script>([
    ["alpha:01-answer:1", () => { throw new TypeError("a programmer error inside the runtime's own tool callback"); }],
    ["main:01-parent:1", (context) => [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "alpha", input: "a" }] })], { stopReason: "toolUse" }),
      async () => { await writeFile(outputOf(context), "parent"); return fauxAssistantMessage("done"); },
    ]],
  ]);
  const run = await start(parent, assembly(parent, new Map([["alpha", alpha]])), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  const record = await flowEvents(run.writer.writer.recordPath);
  expect(at(record, record.length - 1)).toMatchObject({ event: "run_end", exit: 0, cause: "success" });
});
