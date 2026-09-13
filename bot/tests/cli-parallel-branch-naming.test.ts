// Ticket 0063 item 3 — what a PARALLEL branch's output is CALLED when it
// reaches the next stage. End to end through the real `main(["run", "start", ...])`
// with the faux provider (the cli-* idiom), so the naming witnessed is the
// runtime's own.
//
// This is the one leg of item 3 that was not already pinned, and the reason it
// was missed is worth keeping. `cli-fanout-handoff.test.ts` witnesses the fan-in
// with a two-branch fixture whose branches are single stage files, `alpha.md`
// and `beta.md` — so the branch's name and its producing stage's name are the
// SAME STRING, and no assertion over that fixture can tell which of the two the
// runtime used. Measured, not assumed: `containers.ts`'s `branchOutput` was
// changed to deliver the producing stage's name instead of the branch's, and the
// whole gate stayed green at 359/359. Likewise forcing every branch's delivered
// extension to `.txt`: green at 359/359.
//
// So the fixture here is `parallel.md`'s OWN example tree, which discriminates
// on both counts:
// - `research/` is «a folder holding numbered stages that run in order»
//   (parallel.md:18-20), so its last stage is `02-summarize` and its output is
//   sealed at `.../research/02-summarize/1/1/output.txt` — yet it must arrive
//   as `research.txt`. The branch name is not readable off the path.
// - `risk/` is a stage folder carrying `schema.json`, so its extension is the
//   one its own schema chose, and it must arrive as `risk.json`, not `risk.txt`.
// - `cost.md` is a single stage file, the already-covered shape, kept so the
//   three-way fan-in and the name ordering are witnessed together.
//
// The assertion sources:
// - parallel.md:34-42: "Each branch writes its own `$OUTPUT`, and the stage
//   after the parallel stage receives all of them as named files in its
//   `$INPUT`", over the literal block `$INPUT/research.txt`, `$INPUT/risk.json`,
//   `$INPUT/cost.txt`.
// - parallel.md:44-46: "The filesystem is the namespace, the branch name is the
//   key" — the sentence this file is the witness for.
// - parallel.md:17-20: "A branch is a single stage file, a stage folder, or a
//   folder holding numbered stages that run in order."
// - invariant 41 (parallel.md:64-66): "Where order is not numbered, it is name
//   order" — cost, research, risk.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { mkdir, writeFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { events, queue, realBoundary, received, router, sealedOutput, start, tempRoots, writes } from "./cli-boundary.ts";

const { scratch, cleanup } = tempRoots();
afterEach(async () => { await cleanup(); });

const PREPARE = "Preparemarker: prepare the material.";
const GATHER = "Gathermarker: gather the sources.";
const SUMMARIZE = "Summarizemarker: summarize what was gathered.";
const RISK = "Riskmarker: assess the risk.";
const COST = "Costmarker: price it.";
const REPORT = "Reportmarker: report over all three branches.";

// parallel.md:5-15's tree, verbatim in shape: a two-stage branch folder, a
// stage folder with a schema, and a single stage file.
async function assembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  const assess = join(flow, "02-assess");
  await Promise.all([
    mkdir(join(assess, "research"), { recursive: true }),
    mkdir(join(assess, "risk"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-prepare.md"), `---\n---\n${PREPARE}\n`),
    writeFile(join(assess, "PARALLEL.md"), "---\nwidth: 3\n---\n"),
    writeFile(join(assess, "research/01-gather.md"), `---\n---\n${GATHER}\n`),
    writeFile(join(assess, "research/02-summarize.md"), `---\n---\n${SUMMARIZE}\n`),
    writeFile(join(assess, "risk/STAGE.md"), `---\n---\n${RISK}\n`),
    writeFile(join(assess, "risk/schema.json"), '{"type":"object","required":["level"]}\n'),
    writeFile(join(assess, "cost.md"), `---\n---\n${COST}\n`),
    writeFile(join(flow, "03-report.md"), `---\n---\n${REPORT}\n`),
  ]);
}

test("a PARALLEL branch's output reaches the next stage under the BRANCH's name and its own schema's extension, whatever the stage inside it that produced it was called", async () => {
  const { root, home } = await scratch("bot-cli-branch-naming-");
  await assembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);

  // All three branches run at once, so a positional queue could not say which
  // branch a response belongs to: every step is the same prompt-reading router.
  const answer = (text: string) => (round: number) =>
    round === 1 ? writes("$OUTPUT", text) : fauxAssistantMessage("done");
  queue(faux, router({
    [PREPARE]: answer("the material"),
    [GATHER]: answer("the gathered sources"),
    [SUMMARIZE]: answer("the research summary"),
    [RISK]: answer('{"level":"low"}'),
    [COST]: answer("the cost"),
    [REPORT]: answer("the report"),
  }), 24);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the report");

  const run = (await readdir(join(home, "runs"))).filter((entry) => !entry.endsWith(".lock"))[0] ?? "";
  const record = await events(join(home, "runs", run, "record.jsonl"));

  // Where each branch really sealed its output. `research`'s is under the
  // stage that wrote it — `02-summarize` — and nothing in that path says
  // "research" except the branch directory two levels up.
  const summary = sealedOutput(record, "02-assess/research/02-summarize");
  const risk = sealedOutput(record, "02-assess/risk");
  const cost = sealedOutput(record, "02-assess/cost");
  expect(summary.path).toBe("stages/02-assess/research/02-summarize/1/1/output.txt");
  expect(risk.path).toBe("stages/02-assess/risk/1/1/output.json");
  expect(cost.path).toBe("stages/02-assess/cost/1/1/output.txt");

  // THE PIN. parallel.md's own example block, produced by a real run:
  //   $INPUT/research.txt
  //   $INPUT/risk.json
  //   $INPUT/cost.txt
  // in name order. `research.txt` is the half no fixture could see before — the
  // producing stage is called `summarize`, and "the branch name is the key".
  // `risk.json` is the other half: the extension is the branch's own schema's.
  expect(received(start(record, "03-report"))).toEqual([
    { name: "cost.txt", path: cost.path, sha256: cost.sha256 },
    { name: "research.txt", path: summary.path, sha256: summary.sha256 },
    { name: "risk.json", path: risk.path, sha256: risk.sha256 },
  ]);

  // And the contrast that gives the pin its meaning, from inside the same run:
  // INSIDE a branch the stages see each other's names, so `01-gather`'s output
  // reaches `02-summarize` as `gather.txt`. Outside, that name is gone and the
  // branch's stands in its place — the same output, two names, chosen by which
  // side of the branch boundary is reading.
  const gathered = sealedOutput(record, "02-assess/research/01-gather");
  expect(received(start(record, "02-assess/research/02-summarize")))
    .toEqual([{ name: "gather.txt", path: gathered.path, sha256: gathered.sha256 }]);

  // All three really ran, so nothing above passed by a branch quietly not
  // happening (record.md "For each container").
  expect(record.filter((event) => event["event"] === "parallel_done")).toEqual([expect.objectContaining({
    stage: "02-assess",
    branches: [
      { branch: "cost", started: true, exit: 0, cause: "success" },
      { branch: "research", started: true, exit: 0, cause: "success" },
      { branch: "risk", started: true, exit: 0, cause: "success" },
    ],
  })]);
});
