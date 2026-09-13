// Ticket 0044 — pin queue P2: container input fan-out and extension handoff,
// end to end through the REAL defaultGating via main() with the faux provider
// (the cli-stage-options idiom, 0041). Three pins:
// (1) PARALLEL fan-out: every branch receives the same upstream output
//     unchanged (parallel.md "Every branch gets the same input"), the stage
//     after receives one file per branch in bytewise name order
//     (graph.md "How a container's work reaches the next stage"; invariant
//     41), and parallel_done records which branches ran (record.md "For each
//     container").
// (2) LOOP handoff: repeat 2 receives the loop's input plus repeat 1's output
//     (loop.md "Input and output"), repeats carry the `repeat` field
//     (record.md "Identity"), and the post-loop stage receives the last
//     repeat's output under the loop's own name.
// (3) Extension handoff: a schema.json stage writes output.json — the schema
//     file's extension decides the output's format (schema.md), NOT a
//     frontmatter key (stage frontmatter is closed) — and the extension
//     travels into the next stage's $INPUT name and the record's paths.
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { events as record, realBoundary, received, sealedOutput, start } from "./cli-boundary.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function writes(content: string) {
  return [
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ];
}

// Stage, two-branch PARALLEL, stage. `width: 1` holds one branch back, so
// branches start in name order (parallel.md "Width"; invariant 41) and the
// faux response queue stays deterministic — the fan-out semantics under test
// do not depend on width.
async function parallelAssembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(join(flow, "02-assess"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-prepare.md"), "---\n---\nPrepare the material.\n"),
    writeFile(join(flow, "02-assess/PARALLEL.md"), "---\nwidth: 1\n---\n"),
    writeFile(join(flow, "02-assess/alpha.md"), "---\n---\nAssess one way.\n"),
    writeFile(join(flow, "02-assess/beta.md"), "---\n---\nAssess the other way.\n"),
    writeFile(join(flow, "03-report.md"), "---\n---\nReport over both.\n"),
  ]);
}

test("PARALLEL fan-out: both branches receive A's output unchanged, the next stage receives both branch outputs in name order, parallel_done says what ran", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-fanout-"));
  roots.push(root);
  const home = join(root, "home");
  await parallelAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([...writes("prepared"), ...writes("alpha view"), ...writes("beta view"), ...writes("the report")]);

  // flow.md: the flow's output is its last stage's output; runtime.md
  // "Streams": on success the run's output goes to standard output.
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the report");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));

  // parallel.md "Every branch gets the same input": "The parallel stage's
  // input is handed to each branch unchanged." Both branches' stage_start
  // name the SAME upstream output — A's — same path, same sha256. The branch
  // is a folder in the identity path (record.md "Identity": "02-assess/risk
  // says everything").
  const prepared = sealedOutput(events, "01-prepare");
  expect(prepared.path).toBe("stages/01-prepare/1/1/output.txt");
  const same = { name: "prepare.txt", path: prepared.path, sha256: prepared.sha256 };
  expect(received(start(events, "02-assess/alpha"))).toEqual([same]);
  expect(received(start(events, "02-assess/beta"))).toEqual([same]);

  // graph.md: after a PARALLEL, "$INPUT holds one file per branch, each named
  // after its branch"; slots.md names them after the branches. Invariant 41:
  // "Where order is not numbered, it is name order ... bytewise over UTF-8" —
  // so alpha before beta, and each entry is that branch's sealed output.
  const alpha = sealedOutput(events, "02-assess/alpha");
  const beta = sealedOutput(events, "02-assess/beta");
  expect(received(start(events, "03-report"))).toEqual([
    { name: "alpha.txt", path: alpha.path, sha256: alpha.sha256 },
    { name: "beta.txt", path: beta.path, sha256: beta.sha256 },
  ]);
  expect(alpha.path).toBe("stages/02-assess/alpha/1/1/output.txt");
  expect(beta.path).toBe("stages/02-assess/beta/1/1/output.txt");

  // record.md "For each container": "which branches of a PARALLEL ran and
  // what each produced"; parallel.md "Width": "A runtime records how many ran
  // concurrently, and the recorded order of branches never implies the order
  // they finished in" — the branches list is in name order.
  const done = events.filter((event) => event["event"] === "parallel_done");
  expect(done).toEqual([expect.objectContaining({
    stage: "02-assess",
    width: 1,
    concurrent: 1,
    branches: [
      { branch: "alpha", started: true, exit: 0, cause: "success" },
      { branch: "beta", started: true, exit: 0, cause: "success" },
    ],
  })]);
});

// A fixed-count loop: loop.md "`repeat`" — "One key, required on every
// LOOP.md"; "No body. The loop runs `repeat` times and nothing decides
// anything." The sentinel still carries its fences (invariant 42).
async function loopAssembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(join(flow, "01-cycle"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-cycle/LOOP.md"), "---\nrepeat: 2\n---\n"),
    writeFile(join(flow, "01-cycle/01-work.md"), "---\n---\nRevise the draft.\n"),
    writeFile(join(flow, "02-tail.md"), "---\n---\nUse the final draft.\n"),
  ]);
}

test("LOOP handoff: repeat 2 receives repeat 1's output beside the loop's input, both repeats carry the repeat field, the next stage receives the last repeat's output under the loop's name", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-loop-"));
  roots.push(root);
  const home = join(root, "home");
  await loopAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([...writes("draft one"), ...writes("draft two"), ...writes("tail answer")]);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("tail answer");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));

  // record.md "Identity": "`repeat` appears iff the stage sits inside a
  // `LOOP`" — present on both repeats' events, absent outside the loop.
  const first = start(events, "01-cycle/01-work", 1);
  const second = start(events, "01-cycle/01-work", 2);
  expect(first).toMatchObject({ repeat: 1, retry: 1 });
  expect(second).toMatchObject({ repeat: 2, retry: 1 });

  // loop.md "Input and output": "The loop's first stage receives the loop's
  // own input on the first repeat. On every repeat after that it also
  // receives the previous repeat's output, as another named file in $INPUT."
  // The repeat directory level is the first counter (record.md: "the first is
  // the repeat"), so repeat 1's output sits under .../1/1/.
  expect(received(first)).toEqual([expect.objectContaining({ name: "request.txt" })]);
  const draftOne = sealedOutput(events, "01-cycle/01-work", 1);
  expect(draftOne.path).toBe("stages/01-cycle/01-work/1/1/output.txt");
  expect(received(second)).toEqual([
    expect.objectContaining({ name: "request.txt" }),
    { name: "work.txt", path: draftOne.path, sha256: draftOne.sha256 },
  ]);
  expect(draftOne.sha256).not.toBe(sealedOutput(events, "01-cycle/01-work", 2).sha256);

  // loop.md: "The loop passes along the output of its last stage from its
  // final repeat, under the loop's own name" — graph.md's table: "one file,
  // named after the loop, from the last stage of the last repeat".
  const draftTwo = sealedOutput(events, "01-cycle/01-work", 2);
  expect(draftTwo.path).toBe("stages/01-cycle/01-work/2/1/output.txt");
  const tail = start(events, "02-tail");
  expect(tail).not.toHaveProperty("repeat");
  expect(received(tail)).toEqual([{ name: "cycle.txt", path: draftTwo.path, sha256: draftTwo.sha256 }]);

  // record.md "For each container": "how many repeats a LOOP ran and what
  // ended it". loop.md "Running out": "A loop with no body cannot run out. It
  // ran the number of times it was told to" — the count is what ended it.
  const done = events.filter((event) => event["event"] === "loop_done");
  expect(done).toEqual([expect.objectContaining({ stage: "01-cycle", repeats: 2, ended_by: "limit" })]);

  // The outcome table keeps loop repeats distinct and in first-appearance
  // order. Its compact run arithmetic is pinned by show-outcome.test.ts.
  const shown: Buffer[] = [];
  const { held: showBoundary } = realBoundary(root, home, shown, []);
  await expect(main(["run", "events", run], showBoundary)).resolves.toBe(0);
  const summary = Buffer.concat(shown).toString().trimEnd().split("\n")
    .filter((line) => /^(?:01-cycle\/01-work#[12]|02-tail|total)\b/u.test(line));
  expect(summary.map((line) => line.trimStart().split(/\s+/u)[0]))
    .toEqual(["01-cycle/01-work#1", "01-cycle/01-work#2", "02-tail", "total"]);
  expect(summary.every((line) => /input: .+\s+output: .+\s+total: ./u.test(line))).toBe(true);
});

// schema.md: "It is a file in the stage folder, and its extension decides the
// output's format" — `schema.json` means `$OUTPUT` is JSON. The declaration
// is the schema file itself, never frontmatter: stage frontmatter is closed
// (stage.md "The prompt and the configuration").
async function extensionAssembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(join(flow, "01-extract"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-extract/STAGE.md"), "---\n---\nExtract the facts as JSON.\n"),
    writeFile(join(flow, "01-extract/schema.json"), '{"type":"object","required":["answer"]}\n'),
    writeFile(join(flow, "02-summarize.md"), "---\n---\nSummarize the extraction.\n"),
  ]);
}

test("extension handoff: a schema.json stage seals output.json, the next stage receives it as extract.json, and the record's paths carry the extension", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-extension-"));
  roots.push(root);
  const home = join(root, "home");
  await extensionAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([...writes('{"answer":"forty-two"}'), ...writes("the summary")]);

  // runtime.md "Streams": on success the run's output — the last stage's —
  // goes to standard output, whatever the earlier stage's extension was.
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the summary");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));

  // stage.md "Input and output": "The schema chooses the format, and
  // therefore the extension." The sealed file on disk is output.json under
  // the stage's repeat/attempt levels (record.md's tree shows
  // `.../1/output.json`), and stage_end's output.path carries it.
  const extract = sealedOutput(events, "01-extract");
  expect(extract.path).toBe("stages/01-extract/1/1/output.json");
  await expect(readFile(join(home, "runs", run, extract.path), "utf8")).resolves.toBe('{"answer":"forty-two"}');

  // schema.md "What the next stage sees": "A stage named `analyze` with a
  // `schema.json` puts `analyze.json` in front of whatever runs next";
  // slots.md: "The extension is the one the producing stage's schema chose".
  expect(received(start(events, "02-summarize"))).toEqual([
    { name: "extract.json", path: extract.path, sha256: extract.sha256 },
  ]);

  // The plain downstream stage had no schema, so its own output stayed .txt
  // (slots.md: "or `.txt` when it had none").
  expect(sealedOutput(events, "02-summarize").path).toBe("stages/02-summarize/1/1/output.txt");
});
