// Ticket 0064 move 2 — the spec witness that `bot check`'s stage names and the
// record's stage names are ONE string, not two that happen to agree.
//
// record.md "Identity": «A stage is identified by its path in the flow… `stage`
// is the path from the flow root, with the leading numbers kept, because that is
// what the author wrote and what a reader can find on disk.» inspection.md
// "`bot check`": it «takes the same arguments as `bot run`… so that everything
// it reports is resolved the way the run would resolve it», and «`--json` writes
// one object per stage». Check PREDICTS what the record will say; the record is
// where the field is defined. So the two must name each stage identically, and
// `bot session <run> <stage>` — which matches the record's spelling — is what
// stops being usable when they drift.
//
// Before this ticket the two were computed by two expressions in two files
// (`stagePath` in containers.ts, `displayedStage` in inspection.ts); they now
// come from one function (model.ts `stagePath`). These tests fail if a second
// answer is ever reintroduced.
import { semanticCheck } from "./semantic-check.ts";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";

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

function realBoundary(root: string, home: string, output: Buffer[], errors: Buffer[]) {
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const held: CliBoundary = {
    cwd: root,
    env: { ...process.env, BOT_HOME: home, PWD: root, XDG_CACHE_HOME: join(root, "cache") },
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

// Every stage answers the same way, so no ordering assumption is smuggled in:
// six agent stages (two branches, two repeats, the tail), two calls each.
function writes(times: number) {
  return Array.from({ length: times }, () => [
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "the work" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]).flat();
}

/** The stage names `bot check --json` prints, in the order it prints them. */
async function checkStages(root: string, home: string, target: string): Promise<string[]> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);
  await expect(semanticCheck([ target, "the request", "--json"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  return Buffer.concat(stdout).toString().trimEnd().split("\n")
    .map((line) => (JSON.parse(line) as { stage: string }).stage);
}

/** Every distinct `stage` the sealed record names, in bytewise order. */
async function recordStages(root: string, home: string, target: string, stages: number): Promise<string[]> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(writes(stages));
  await expect(main(["run", "start", target, "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = (await readFile(join(home, "runs", run, "record.jsonl"), "utf8")).trimEnd().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const named = events.map((event) => event["stage"]).filter((stage) => typeof stage === "string");
  return [...new Set(named)].sort();
}

// A container, a loop and a single-file stage, which is every shape a stage
// name can take: a PARALLEL's branch (named, not numbered — graph.md "Numbered
// and named"), a stage inside a LOOP (numbered, one level down), and a
// numbered single-file stage at the flow root. width: 1 keeps the branches
// sequential so the faux queue is deterministic.
async function fixture(home: string): Promise<void> {
  const flow = join(home, "assemblies/shapes/flows/main");
  await mkdir(join(flow, "01-fan"), { recursive: true });
  await mkdir(join(flow, "02-cycle"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/shapes/ASSEMBLY.md"), "---\nintelligence: default\n---\nShapes assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-fan/PARALLEL.md"), "---\nwidth: 1\n---\n"),
    writeFile(join(flow, "01-fan/alpha.md"), "---\n---\nDo the alpha branch.\n"),
    writeFile(join(flow, "01-fan/beta.md"), "---\n---\nDo the beta branch.\n"),
    writeFile(join(flow, "02-cycle/LOOP.md"), "---\nrepeat: 2\n---\n"),
    writeFile(join(flow, "02-cycle/01-step.md"), "---\n---\nDo one pass.\n"),
    writeFile(join(flow, "03-report.md"), "---\n---\nReport.\n"),
  ]);
}

test("check's stage names and the record's stage names are the same six strings", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-stage-identity-"));
  roots.push(root);
  const home = join(root, "home");
  await fixture(home);

  // What the right answer IS — the path from the flow root, numbers kept, the
  // stage file's own `.md` off (record.md "Identity"). A container emits its
  // own line and then the lines for what is inside it (inspection.md).
  const expected = ["01-fan", "01-fan/alpha", "01-fan/beta", "02-cycle", "02-cycle/01-step", "03-report"];
  const checked = await checkStages(root, home, "shapes/main");
  expect(checked).toEqual(expected);

  // The run really visited all six: five agent stages plus the LOOP's own
  // loop_done identity and the PARALLEL's parallel_done identity.
  const recorded = await recordStages(root, home, "shapes/main", 5);
  expect(recorded).toEqual([...expected].sort());
  expect([...checked].sort()).toEqual(recorded);
});

// The case that made the two expressions distinguishable: a folder whose own
// name ends in `.md`. graph.md accepts it — a sequence entry is any directory
// (holding its sentinel) or any `.md` file, and nothing forbids the four
// characters. Check used to strip `.md` at every segment boundary and print
// `01-wrap/01-inner` for a stage the record called `01-wrap.md/01-inner`;
// `bot session <run> 01-wrap/01-inner` then found nothing. One function, one
// answer, and it is the record's.
//
// Ticket 0063 item 11 then made that one answer faithful, which is what this
// fixture's three shapes witness: `.md` comes off a single-FILE stage
// (`02-tail.md` → `02-tail`) and off nothing else, because only a file is
// found on disk under a name without it. A container folder (`01-wrap.md/`)
// and a stage folder (`03-boxed.md/`) are both found under the name they
// were given, so both keep the four characters.
test("*.md-named folders keep the extension; only a single-file stage loses it", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-stage-identity-md-"));
  roots.push(root);
  const home = join(root, "home");
  const flow = join(home, "assemblies/wrapped/flows/main");
  await mkdir(join(flow, "01-wrap.md"), { recursive: true });
  await mkdir(join(flow, "03-boxed.md"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/wrapped/ASSEMBLY.md"), "---\nintelligence: default\n---\nWrapped assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-wrap.md/LOOP.md"), "---\nrepeat: 1\n---\n"),
    writeFile(join(flow, "01-wrap.md/01-inner.md"), "---\n---\nDo the inner work.\n"),
    writeFile(join(flow, "02-tail.md"), "---\n---\nUse the work.\n"),
    writeFile(join(flow, "03-boxed.md/STAGE.md"), "---\n---\nBox the work.\n"),
  ]);

  const expected = ["01-wrap.md", "01-wrap.md/01-inner", "02-tail", "03-boxed.md"];
  const checked = await checkStages(root, home, "wrapped/main");
  expect(checked).toEqual(expected);
  const recorded = await recordStages(root, home, "wrapped/main", 3);
  expect(recorded).toEqual([...expected].sort());
});
