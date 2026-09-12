// Ticket 0120, ceiling one — 32 at once, Ian's ruling of 2026-08-05. The
// static half is a `PARALLEL`'s width, which `bot check` refuses before
// anything runs (parallel.md "Width"); the dynamic half is a `subflow` batch,
// which is the agent's own decision and so comes back as a tool result rather
// than faulting the run (subflow.md "The call", runtime.md's tool rules).
//
// Both boundaries are witnessed: 32 is accepted and unchanged, 33 is not.
// Nothing here reaches a model or the real ~/.pi, ~/.cache or ~/.local/share.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { check } from "../src/reader.ts";
import { createSubflowTool } from "../src/tools.ts";
import { at, callsSubflow, events, queue, realBoundary, router, runsIn, tempRoots, writes } from "./cli-boundary.ts";

const roots = tempRoots();
const dirs: string[] = [];
afterEach(async () => {
  await roots.cleanup();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A sound assembly at ./asm whose one flow holds a PARALLEL of `branches`
 *  branches, carrying `width` when one is given. */
async function parallelOf(branches: number, width?: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bot-ceiling-width-"));
  dirs.push(dir);
  const stage = join(dir, "asm/flows/main/01-assess");
  await mkdir(stage, { recursive: true });
  await mkdir(join(dir, "home"));
  await writeFile(join(dir, "home/config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n");
  await writeFile(join(dir, "asm/ASSEMBLY.md"), "---\nintelligence: default\n---\nRoute.\n");
  await writeFile(join(dir, "asm/flows/main/FLOW.md"), "---\ndescription: d\n---\n");
  await writeFile(join(dir, "asm/flows/main/99-done.md"), "---\n---\nDo.\n");
  await writeFile(join(stage, "PARALLEL.md"), width === undefined ? "---\n---\n" : `---\nwidth: ${String(width)}\n---\n`);
  for (let index = 0; index < branches; index += 1) {
    await writeFile(join(stage, `b${String(index).padStart(2, "0")}.md`), "---\n---\nDo.\n");
  }
  return dir;
}

const REFUSED = '{"code":"value-invalid","path":"flows/main/01-assess/PARALLEL.md","message":"Give width a value of at most 32."}';

test("a PARALLEL of width 32 checks; 33 is refused, in the shape its neighbours refuse in", async () => {
  const wideRoot = await parallelOf(2, 32);
  const wide = check("./asm/main", wideRoot, { ...process.env, BOT_HOME: join(wideRoot, "home") });
  expect([wide.exitCode, wide.lines.filter((line) => line.includes("value-invalid"))]).toEqual([0, []]);
  const overRoot = await parallelOf(2, 33);
  const over = check("./asm/main", overRoot, { ...process.env, BOT_HOME: join(overRoot, "home") });
  expect(over.exitCode).toBe(2);
  expect(over.lines).toEqual([REFUSED]);
});

// The width a PARALLEL has when it authors none is the number of its branches
// (parallel.md: "All of them, unless this says otherwise"), so the ceiling is
// on that number too — otherwise deleting a key buys 33 agents at once.
test("a PARALLEL with no width refuses at 33 branches and checks at 32", async () => {
  const heldRoot = await parallelOf(32);
  const held = check("./asm/main", heldRoot, { ...process.env, BOT_HOME: join(heldRoot, "home") });
  expect(held.exitCode).toBe(0);
  const overRoot = await parallelOf(33);
  const over = check("./asm/main", overRoot, { ...process.env, BOT_HOME: join(overRoot, "home") });
  expect(over.exitCode).toBe(2);
  expect(over.lines).toEqual([REFUSED]);
});

function batch(size: number): { flow: string; input: string }[] {
  return Array.from({ length: size }, (_unused, index) => ({ flow: "helper", input: `question ${String(index)}` }));
}

test("a subflow batch of 32 runs; 33 is sent back before any child starts", async () => {
  const seen: number[] = [];
  const tool = createSubflowTool((calls) => {
    seen.push(calls.length);
    return Promise.resolve([]);
  });
  await tool.execute("one", { calls: batch(32) }, undefined, undefined, undefined as never);
  await expect(tool.execute("two", { calls: batch(33) }, undefined, undefined, undefined as never))
    .rejects.toThrow("A subflow batch takes at most 32 calls; this one has 33. Split it.");
  expect(seen).toEqual([32]);
});

const ASSEMBLY = "---\nintelligence: default\n---\nReview assembly.\n";

// Feedback, not a fault: the run carries on and ends 0, which is what makes
// the ceiling a send-back rather than a hang or a terminal error.
test("an oversized batch is a tool result the agent recovers from: the run still ends 0", async () => {
  const { root, home } = await roots.scratch("bot-ceiling-batch-");
  const base = join(home, "assemblies/review");
  await mkdir(join(base, "flows/main/01-parent"), { recursive: true });
  await mkdir(join(base, "subflows/helper/01-answer"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), ASSEMBLY),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-parent/STAGE.md"), "---\n---\nParentmarker: do the work.\n"),
    writeFile(join(base, "subflows/helper/FLOW.md"), "---\ndescription: a helper flow\n---\n"),
    writeFile(join(base, "subflows/helper/01-answer/STAGE.md"), "---\n---\nChildmarker: answer.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  queue(faux, router({
    Parentmarker: (round) => round === 1
      ? callsSubflow(batch(33))
      : round === 2 ? writes("$OUTPUT", "the answer") : fauxAssistantMessage("done"),
  }), 6);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  // No child ran: the send-back happened before the batch was numbered, so
  // the record holds no subflow call at all and no child run directory exists.
  const run = at(await runsIn(home), 0);
  const record = await events(join(home, "runs", run, "record.jsonl"));
  expect(record.filter((event) => event["event"] === "subflow_call")).toEqual([]);
  expect(existsSync(join(home, "runs", run, "stages/01-parent/1/1/subflows"))).toBe(false);
});
