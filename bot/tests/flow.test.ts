import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { readAssembly } from "../src/assembly.ts";
import type { Branch, LoopNode, ParallelNode } from "../src/model.ts";
import { createProcessGroups, runProcess, type Executable } from "../src/process.ts";
import { hashBytes } from "../src/record.ts";
import { showLine } from "../src/readings.ts";
import { attempt } from "./scratch.ts";
import { outputOf } from "./hostile.ts";
import { manualClock } from "./manual-clock.ts";
import { assembly, clock, events, flow, roots, stage, start, writes, type Script } from "./flow-harness.ts";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("the reader retains loop questions, DESCEND depth, and stage-local subflows", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-flow-reader-"));
  roots.push(root);
  await Promise.all([
    mkdir(join(root, "flows/main/01-cycle"), { recursive: true }),
    mkdir(join(root, "flows/main/02-final/subflows/local"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\n{}\n---\nAssembly.\n"),
    writeFile(join(root, "flows/main/DESCEND.md"), "---\ndescription: descend\nmax-depth: 2\n---\n"),
    writeFile(join(root, "flows/main/01-cycle/LOOP.md"), "---\nrepeat: 2\n---\nReady?\n"),
    writeFile(join(root, "flows/main/01-cycle/01-work.md"), "---\n{}\n---\nWork.\n"),
    writeFile(join(root, "flows/main/02-final/STAGE.md"), "---\n{}\n---\nFinish.\n"),
    writeFile(join(root, "flows/main/02-final/subflows/local/FLOW.md"), "---\ndescription: local\n---\n"),
    writeFile(join(root, "flows/main/02-final/subflows/local/01-answer.md"), "---\n{}\n---\nAnswer.\n"),
  ]);
  const parsed = readAssembly(root, {});
  expect(parsed.faults).toEqual([]);
  const main = parsed.flows.get("main");
  expect(main?.maxDepth).toBe(2);
  expect(main?.sequence.nodes[0]).toMatchObject({ kind: "LOOP", question: "Ready?\n" });
  const final = main?.sequence.nodes[1];
  expect(final?.kind === "STAGE" ? [...final.subflows.keys()] : []).toEqual(["local"]);
});

test("a two-stage flow passes the sealed first output into the second stage", async () => {
  const main = flow("main", "flows/main", [stage("flows/main/01-first.md", "first"), stage("flows/main/02-second.md", "second")]);
  const scripts = new Map<string, Script>([
    ["main:01-first:1", writes("alpha")],
    ["main:02-second:1", (context) => [async () => {
      expect(await readFile(join(context.inputPath, "first.txt"), "utf8")).toBe("alpha");
      await writeFile(outputOf(context), "beta");
      return fauxAssistantMessage("done");
    }]],
  ]);
  const run = await start(main, assembly(main), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
});

test("LOOP records stop, fixed-count limit, and unanswered-question exhaustion", async () => {
  const cases: { name: string; node: LoopNode; script: Script; ended: string; exit: number }[] = [
    {
      name: "stop",
      node: { kind: "LOOP", name: "cycle", path: "flows/main/01-cycle", options: {}, skills: [], repeat: 3, question: "Ready?", sequence: { path: "flows/main/01-cycle", nodes: [stage("flows/main/01-cycle/01-work.md", "work")] } },
      script: (context) => [async () => { await writeFile(outputOf(context), "ready"); return fauxAssistantMessage("done"); }, fauxAssistantMessage([fauxToolCall("continue", { answer: "stop", reason: "ready" })], { stopReason: "toolUse" })],
      ended: "stop", exit: 0,
    },
    {
      name: "limit",
      node: { kind: "LOOP", name: "cycle", path: "flows/main/01-cycle", options: {}, skills: [], repeat: 2, sequence: { path: "flows/main/01-cycle", nodes: [stage("flows/main/01-cycle/01-work.md", "work")] } },
      script: writes("fixed"), ended: "limit", exit: 0,
    },
    {
      name: "exhausted",
      node: { kind: "LOOP", name: "cycle", path: "flows/main/01-cycle", options: {}, skills: [], repeat: 2, question: "Ready?", sequence: { path: "flows/main/01-cycle", nodes: [stage("flows/main/01-cycle/01-work.md", "work")] } },
      script: (context) => [async () => { await writeFile(outputOf(context), "draft"); return fauxAssistantMessage("done"); }, fauxAssistantMessage("no answer")],
      ended: "exhausted", exit: 1,
    },
  ];
  for (const held of cases) {
    const tail = stage("flows/main/02-tail.md", "tail");
    const main = flow("main", "flows/main", [held.node, tail]);
    const scripts = new Map<string, Script>([["main:01-cycle/01-work:1", held.script], ["main:01-cycle/01-work:2", held.script], ["main:02-tail:1", writes("tail")]]);
    const run = await start(main, assembly(main), scripts);
    expect((await run.result).exit, held.name).toBe(held.exit);
    const record = await events(run.writer.writer.recordPath);
    expect(record).toContainEqual(expect.objectContaining({ event: "loop_done", ended_by: held.ended }));
    if (held.exit === 0) expect(record, held.name).toContainEqual(expect.objectContaining({ event: "stage_end", stage: "02-tail", exit: 0 }));
  }
});

function branch(path: string, name: string): Branch {
  return { name, path, sequence: { path, nodes: [stage(`${path}.md`, name)] } };
}

/** A promise and its resolver: the test's own synchronisation, in place of a sleep. */
function latch(): { reached: Promise<void>; reach: () => void } {
  let reach = (): void => undefined;
  const reached = new Promise<void>((settle) => { reach = (): void => { settle(); }; });
  return { reached, reach };
}

// Ticket 0063 item 16. This test used to arrange its scenario with four real
// sleeps (a 10ms, b 25ms, c 80ms, d 120ms) and it failed once under load with
// `{ branch: "d", started: false }` — branch d never dispatched, because
// `pool.ts`'s worker reads `stop` before taking its next item and branch c had
// already failed by the time branch b freed a slot. Per-stage overhead, not the
// sleeps, is the dominant term under contention, and it reordered them.
//
// **The assertion was wrong, not the runtime**, and `parallel.md` says so in
// the very sentence this test witnesses: "Which branches had started by the
// time one failed is a fact of timing — a fast sibling frees a slot early — so
// the record says which ran, per branch, rather than the format promising the
// same set on every runtime." A hard-coded `started: true` for d asserted one
// outcome of a fact the format explicitly refuses to promise.
//
// So the scenario is now built by construction instead of by luck: latches, not
// sleeps. The first two branches dispatched must both be inside their scripts
// before either may settle (so both `stage_start`s precede any second-wave
// dispatch, and the width is genuinely exercised); the failing branch may not
// fail until all four are in flight; the last branch may not finish until the
// failing one is on its way out. Nothing here is timing any more, so nothing
// here can lose a race. No assertion was relaxed — the deep-equal is unchanged.
//
// The latches count arrivals rather than naming them, deliberately: a runtime
// that dispatched in DECLARATION order would still satisfy every latch and then
// fail on the name-order assertion, which is the report a reader wants. If a
// latch is genuinely unreachable — a pool that stops dispatching before the
// fourth branch — no arrival ever comes and the stage's own 2s budget ends the
// run as `timeout`. That is still a deterministic red, just a blunter one.
test("PARALLEL width two starts in name order and records every started settlement after failure", async () => {
  const parallel: ParallelNode = {
    kind: "PARALLEL", name: "fan", path: "flows/main/01-fan", options: {}, skills: [], width: 2,
    branches: [branch("flows/main/01-fan/d", "d"), branch("flows/main/01-fan/b", "b"), branch("flows/main/01-fan/a", "a"), branch("flows/main/01-fan/c", "c")],
  };
  const main = flow("main", "flows/main", [parallel, stage("flows/main/02-tail.md", "tail")]);
  const paired = latch();   // two branches are running at once
  const allIn = latch();    // all four have been dispatched
  const failing = latch();  // the failing branch is returning its empty answer
  let inFlight = 0;
  const enter = (): void => {
    inFlight += 1;
    if (inFlight === 2) paired.reach();
    if (inFlight === 4) allIn.reach();
  };
  // The first wave: neither may settle until a second branch is running, which
  // is what holds the second wave back until both `stage_start`s are written.
  const together = (text: string): Script => (context) => [async () => {
    enter();
    await paired.reached;
    await writeFile(outputOf(context), text);
    return fauxAssistantMessage("done");
  }];
  const scripts = new Map<string, Script>([
    ["main:01-fan/a:1", together("a")], ["main:01-fan/b:1", together("b")],
    // c fails by writing no output — but not before every branch holds a slot.
    ["main:01-fan/c:1", () => [async () => {
      enter();
      await allIn.reached;
      failing.reach();
      return fauxAssistantMessage("done");
    }]],
    ["main:01-fan/d:1", (context) => [async () => {
      enter();
      await allIn.reached;
      await failing.reached;
      await writeFile(outputOf(context), "d");
      return fauxAssistantMessage("done");
    }]],
  ]);
  const run = await start(main, assembly(main), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 1, cause: "exhausted" });
  const record = await events(run.writer.writer.recordPath);
  const done = record.find((event) => event["event"] === "parallel_done");
  expect(done).toMatchObject({ width: 2, concurrent: 2 });
  expect(done?.["branches"]).toEqual([
    { branch: "a", started: true, exit: 0, cause: "success" }, { branch: "b", started: true, exit: 0, cause: "success" },
    { branch: "c", started: true, exit: 1, cause: "exhausted" }, { branch: "d", started: true, exit: 0, cause: "success" },
  ]);
  const starts = record.filter((event) => event["event"] === "stage_start").map((event) => String(event["stage"]));
  expect(starts.slice(0, 2).sort()).toEqual(["01-fan/a", "01-fan/b"]);
  expect(starts.slice(2).sort()).toEqual(["01-fan/c", "01-fan/d"]);
  expect(record.filter((event) => event["event"] === "stage_end")).toHaveLength(4);
});

async function concreteTree(root: string): Promise<string> {
  const lines = [basename(root)];
  const walk = async (directory: string, prefix: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      lines.push(`${prefix}${entry.name}${entry.isDirectory() ? "/" : ""}`);
      if (entry.isDirectory()) await walk(join(directory, entry.name), `${prefix}  `);
    }
  };
  await walk(root, "  ");
  return lines.join("\n");
}

// Ticket 0063 item 15. This test used to drive a 60ms parent budget and a 500ms
// child budget against `performance.now()`, with the child sleeping 120ms for
// real, and it failed in BOTH directions under a loaded box: once as
// `{ exit: 1, cause: 'timeout' }` when scheduling delay — not the child — spent
// the parent's 60ms, and once on `performance.now() - started > 100`.
//
// The subject was never wall time. It is that the child's work exceeds the
// parent's WHOLE budget and the parent survives it anyway, because
// `subflow-runtime.ts` pauses the parent's clock around the batch (invariant
// 22). On an injected clock that is exact: the only time this run spends is the
// time the child's script asks for, and a starved machine cannot add any.
const PARENT_BUDGET_MS = 60;
const CHILD_BUDGET_MS = 500;
// Deliberately twice the parent's whole budget: if the pause were removed, this
// advance would fire the parent's guard and the run would end `timeout`.
const CHILD_WORK_MS = 120;

test("a looped parallel branch and subflow child produce isolated nested run evidence", async () => {
  const time = manualClock();
  const child = flow("child", "subflows/child", [stage("subflows/child/01-answer.md", "answer")]);
  const fan: ParallelNode = { kind: "PARALLEL", name: "fan", path: "flows/main/01-cycle/01-fan", options: {}, skills: [], width: 2, branches: [branch("flows/main/01-cycle/01-fan/left", "left"), branch("flows/main/01-cycle/01-fan/right", "right")] };
  const parent = stage("flows/main/01-cycle/02-parent.md", "parent");
  const loop: LoopNode = { kind: "LOOP", name: "cycle", path: "flows/main/01-cycle", options: {}, skills: [], repeat: 1, sequence: { path: "flows/main/01-cycle", nodes: [fan, parent] } };
  const main = flow("main", "flows/main", [loop, stage("flows/main/02-final.md", "final")]);
  const runIds: Record<"parent" | "child", string | undefined> = { parent: undefined, child: undefined };
  const scripts = new Map<string, Script>([
    ["main:01-cycle/01-fan/left:1", writes("left")], ["main:01-cycle/01-fan/right:1", writes("right")],
    ["child:01-answer:1", (context) => [async () => {
      // The child's work, as time rather than as sleep. The parent's clock is
      // paused across this batch, so this advance must not reach its guard.
      time.advance(CHILD_WORK_MS);
      runIds.child = context.env["BOT_RUN_ID"];
      expect(await readFile(join(context.inputPath, "request.txt"), "utf8")).toBe("child request");
      expect(context.origin).toBe("subflow");
      expect(context.env["DECLARED"]).toBe("slot value");
      expect(context.env["UNDECLARED"]).toBeUndefined();
      expect(context.env["PARENT_ONLY"]).toBeUndefined();
      await writeFile(outputOf(context), "child answer");
      return fauxAssistantMessage("done");
    }]],
    ["main:01-cycle/02-parent:1", (context) => {
      runIds.parent = context.env["BOT_RUN_ID"];
      context.env["PARENT_ONLY"] = "must not cross";
      return [
        fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "child", input: "child request" }] })], { stopReason: "toolUse" }),
        async () => {
          expect(await readFile(join(context.subflowsPath, "1", "output.txt"), "utf8")).toBe("child answer");
          expect((await readdir(join(context.subflowsPath, "1"))).sort()).toEqual(["input.txt", "output.txt"]);
          await writeFile(outputOf(context), "parent answer");
          return fauxAssistantMessage("done");
        },
      ];
    }],
    ["main:02-final:1", writes("final")],
  ]);
  const run = await start(
    main, assembly(main, new Map([["child", child]]), { declared: "the declared fixture slot" }), scripts,
    {
      slots: { declared: "slot value", undeclared: "must not cross" },
      timeouts: new Map([["main:01-cycle/02-parent:1", PARENT_BUDGET_MS], ["child:01-answer:1", CHILD_BUDGET_MS]]),
      clock: time,
    },
  );
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  const childRuns = await readdir(join(run.writer.writer.runDirectory, "stages/01-cycle/02-parent/1/1/subflows"));
  expect(runIds).toEqual({ parent: basename(run.writer.writer.runDirectory), child: childRuns[0] });
  // What `performance.now() - started > 100` was reaching for, now exactly: the
  // child's advance is the ONLY time this run spent, and it is more than twice
  // the parent budget the run survived.
  expect(time.elapsed()).toBe(CHILD_WORK_MS);
  expect(time.elapsed()).toBeGreaterThan(PARENT_BUDGET_MS);
  const record = await events(run.writer.writer.recordPath);
  expect(record).toContainEqual(expect.objectContaining({ event: "subflow_call", flow: "child", depth: 1, started: true, exit: 0 }));
  const tree = await concreteTree(run.writer.writer.runDirectory);
  const keep = process.env["BOT_KEEP_TREE"];
  if (keep !== undefined) {
    await rm(keep, { recursive: true, force: true });
    await cp(run.writer.writer.runDirectory, keep, { recursive: true });
  }
  expect(tree).toContain("stages/\n");
  expect(tree).toContain("subflows/\n");
  expect(tree).toContain("record.jsonl");
});

test("a signal mid-flow records what completed, where it died, and which signal arrived", async () => {
  const main = flow("main", "flows/main", [
    stage("flows/main/01-design.md", "design"),
    stage("flows/main/02-code-review.md", "code-review"),
    stage("flows/main/03-never.md", "never"),
  ]);
  const root = await mkdtemp(join(tmpdir(), "bot-flow-hook-"));
  roots.push(root);
  const marker = join(root, "failure-ran");
  const hookPath = join(root, "failure.sh");
  await writeFile(hookPath, `#!/bin/sh\ntouch "${marker}"\n`);
  await chmod(hookPath, 0o755);
  const hook: Executable = { path: hookPath, file: "flows/main/02-code-review/failure.sh", sha256: hashBytes(`#!/bin/sh\ntouch "${marker}"\n`) };
  let created = 0;
  const scripts = new Map<string, Script>([
    ["main:01-design:1", (context, signal) => { created += 1; return writes("design completed")(context, signal); }],
    ["main:02-code-review:1", (_context, signal) => { created += 1; return [async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      signal.activate("SIGTERM");
      return fauxAssistantMessage("interrupted");
    }]; }],
    ["main:03-never:1", () => { created += 1; return [fauxAssistantMessage("must not start")]; }],
  ]);
  const run = await start(main, assembly(main), scripts, { hooks: new Map([["main:02-code-review:1", hook]]) });
  await expect(run.result).resolves.toMatchObject({ exit: 143, cause: "signal" });
  expect(created).toBe(2);
  await expect(readFile(marker, "utf8")).rejects.toThrow();
  const record = await events(run.writer.writer.recordPath);
  const completed = [...record].reverse().find((event) => event["event"] === "stage_end" && event["cause"] === "success");
  const ending = [...record].reverse().find((event) => event["event"] === "run_end");
  const signals = record.filter((event) => event["event"] === "signal");
  const arrived = signals.at(-1);
  expect(signals).toHaveLength(1);

  // A terminal consumer such as Factory can carry these facts without
  // reconstructing them from timestamps or a process table.
  expect({ completed: completed?.["stage"], inFlight: ending?.["stage"], signal: arrived?.["name"] })
    .toEqual({ completed: "01-design", inFlight: "02-code-review", signal: "SIGTERM" });

  // The human reading exposes the same three facts instead of reducing the
  // death to its cause. Assert facts and identities, not renderer copy.
  const shown = record.map((event) => showLine(event));
  expect(shown.find((line) => line.includes("  stage_end  01-design/1  "))).toContain("success");
  expect(shown.find((line) => line.includes("  run_end  02-code-review/1  "))).toContain("signal");
  expect(shown.find((line) => line.includes("  signal  -  "))).toContain("SIGTERM, 15");
  expect(record.filter((event) => event["event"] === "hook")).toHaveLength(0);
});

test("subflow numbering spans retries while child records stay under the calling attempt", async () => {
  const child = flow("child", "subflows/child", [stage("subflows/child/01-answer.md", "answer")]);
  const main = flow("main", "flows/main", [stage("flows/main/01-parent.md", "parent")]);
  const call = (input: string) => fauxAssistantMessage(
    [fauxToolCall("subflow", { calls: [{ flow: "child", input }] })], { stopReason: "toolUse" },
  );
  const scripts = new Map<string, Script>([
    ["child:01-answer:1", writes("child")],
    ["main:01-parent:1", (context) => [
      call("one"), fauxAssistantMessage("first attempt has no output"), call("two"),
      async () => { await writeFile(outputOf(context), "parent"); return fauxAssistantMessage("done"); },
    ]],
  ]);
  const run = await start(main, assembly(main, new Map([["child", child]])), scripts, {
    retries: new Map([["main:01-parent:1", 1]]),
  });
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  const record = await events(run.writer.writer.recordPath);
  const calls = record.filter((event) => event["event"] === "subflow_call");
  expect(calls.map((event) => [event["call"], event["retry"]])).toEqual([[1, 1], [2, 2]]);
  const stageRoot = join(run.writer.writer.runDirectory, "stages/01-parent/1");
  for (const n of ["1", "2"]) await expect(readFile(join(stageRoot, n, "subflows", n, "record.jsonl"), "utf8")).resolves.toContain("run_start");
  expect((await readdir(join(attempt(join(run.root, "scratch"), "01-parent"), "answers"))).sort()).toEqual(["1", "2"]);
});

test("DESCEND exposes only the remaining self-chain depth", async () => {
  const down = flow("down", "flows/down", [stage("flows/down/01-work.md", "work")], { maxDepth: 2 });
  const scripts = new Map<string, Script>([["down:01-work:1", (context) => {
    const canDescend = context.tools.some((tool) => tool.name === "subflow");
    if (!canDescend) return [async () => { await writeFile(outputOf(context), "leaf"); return fauxAssistantMessage("leaf"); }];
    return [
      fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "down", input: "smaller" }] })], { stopReason: "toolUse" }),
      async () => { await writeFile(outputOf(context), "root"); return fauxAssistantMessage("root"); },
    ];
  }]]);
  const run = await start(down, assembly(down), scripts);
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  const record = await events(run.writer.writer.recordPath);
  expect(record).toContainEqual(expect.objectContaining({ event: "subflow_call", flow: "down", depth: 2, started: true }));
  const childRecord = join(run.writer.writer.runDirectory, "stages/01-work/1/1/subflows/1/record.jsonl");
  expect((await events(childRecord)).filter((event) => event["event"] === "subflow_call")).toHaveLength(0);
});

test("an agent fault ends the run without spending a retry", async () => {
  const main = flow("main", "flows/main", [stage("flows/main/01-verify.md", "verify"), stage("flows/main/02-never.md", "never")]);
  const reason = "GitHub SSH is unreachable.";
  const scripts = new Map<string, Script>([["main:01-verify:1", () => [
    fauxAssistantMessage([fauxToolCall("fault", { reason })], { stopReason: "toolUse" }),
  ]]]);
  const run = await start(main, assembly(main), scripts, { retries: new Map([["main:01-verify:1", 1]]) });

  await expect(run.result).resolves.toMatchObject({ exit: 2, cause: "fault", reason });
  const record = await events(run.writer.writer.recordPath);
  expect(record).toContainEqual(expect.objectContaining({ event: "tool_call", tool: "fault", decision: "fault", reason }));
  expect(record.filter((event) => event["event"] === "check")).toHaveLength(0);
  expect(record.filter((event) => event["event"] === "stage_start")).toHaveLength(1);
  expect(record.filter((event) => event["event"] === "stage_end")).toEqual([
    expect.objectContaining({ stage: "01-verify", retry: 1, exit: 2, cause: "fault", reason }),
  ]);
  expect(record.filter((event) => event["event"] === "run_end")).toEqual([
    expect.objectContaining({ exit: 2, cause: "fault", reason }),
  ]);
});

// 0029 A6: capture settles on 'close' — a child outliving the gate redirects its stdio, as for $(...).
test("the process boundary settles on direct-child exit and cleans its lingering group", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-process-exit-"));
  roots.push(root);
  const path = join(root, "gate.sh");
  const source = "#!/bin/sh\nsleep 5 >/dev/null 2>&1 &\nprintf 'direct child exited'\nexit 0\n";
  await writeFile(path, source);
  await chmod(path, 0o755);
  const groups = createProcessGroups(clock);
  const started = performance.now();
  const result = await runProcess({
    executable: { path, file: "gate.sh", sha256: hashBytes(source) }, cwd: root, env: {},
    timeoutMs: 2_000, clock, groups,
  });
  expect(performance.now() - started).toBeLessThan(1_000);
  expect(result).toMatchObject({ exit: 0, timedOut: false, aborted: false });
  expect(result.output.toString("utf8")).toBe("direct child exited");
  await groups.terminate();
});
