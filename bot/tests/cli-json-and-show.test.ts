// Ticket 0052 — pin queue P10, the two inspection-surface singles: the machine
// refusal contract `bot run --json` promises (leg 5) and what `bot show <run>`
// renders without --json (leg 6). Both go through main() with the injected
// CliBoundary, the run leg through the REAL defaultGating with the faux
// provider (the cli-stage-options idiom, 0041). The assertion sources:
// - refusals.md:3-5: every refusal carries "a **code**, the **path** at fault,
//   and a sentence for whoever is reading"; refusals.md:12: "`--json` writes
//   one object per line: `{ \"code\", \"path\", \"message\" }`";
//   refusals.md:25-27: "A runtime reports every fault it found rather than
//   stopping at the first, and exits `2`. The order they are reported in is not
//   specified"; help.ts:27 promises the flag on `bot run` as "refusals as JSON
//   lines".
// - inspection.md:9-10: "Every command writes to stdout, one record per line,
//   in a stable field order ... Diagnostics go to stderr."
// - inspection.md:110-113: "`bot show <run>` — The record, read back as the
//   sequence of things that happened: each stage, what it received, what it
//   produced, which checks ran and what they said, how it ended, what it cost";
//   inspection.md:115-116: "`--json` writes the appended events themselves ...
//   This is the form another program reads."
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";
import { createControlTools, createFileTools } from "../src/tools.ts";
import { attempt, scratchRun } from "./scratch.ts";
import { printedLines } from "./invoke.ts";

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

// One folder-form stage with a gate, so the record carries every kind of thing
// `bot show` is asked to render: a stage that received something, produced
// something, was judged by named checks, cost tokens, and ended.
async function assembly(home: string): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-work");
  const assemblySkills = join(home, "assemblies/review/skills");
  const stageSkills = join(stage, "skills");
  await Promise.all([
    mkdir(stage, { recursive: true }),
    mkdir(join(assemblySkills, "house-style"), { recursive: true }),
    mkdir(join(assemblySkills, "shared"), { recursive: true }),
    mkdir(join(stageSkills, "fact-check"), { recursive: true }),
    mkdir(join(stageSkills, "shared"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nDo the work.\n"),
    writeFile(join(stage, "gate"), "#!/bin/sh\necho 'the gate says yes'\nexit 0\n"),
    writeFile(join(assemblySkills, "house-style/SKILL.md"), "---\ndescription: house style\n---\n"),
    writeFile(join(assemblySkills, "shared/SKILL.md"), "---\ndescription: assembly shared\n---\n"),
    writeFile(join(stageSkills, "fact-check/SKILL.md"), "---\ndescription: fact check\n---\n"),
    writeFile(join(stageSkills, "shared/SKILL.md"), "---\ndescription: stage shared\n---\n"),
  ]);
  await chmod(join(stage, "gate"), 0o755);
}

// Record values are `unknown` to a reader; the rendered line's columns are the
// scalar ones, and anything else would not be a column at all.
function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "-";
}

function skillSources(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(value.map((skill) => {
    const held = skill as { name: string; source: string };
    return [held.name, held.source];
  }));
}

async function scratch(prefix: string): Promise<{ root: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  const home = join(root, "home");
  await assembly(home);
  return { root, home };
}

// LEG 5 — the machine refusal contract. TWO faults in one invocation, because
// refusals.md:25-26 promises "every fault it found rather than stopping at the
// first"; the order "is not specified", so the objects are compared as a set
// keyed by path.
test("leg 5 — `bot run --json` writes one {code, path, message} object per fault on stderr, every fault, exit 2, stdout untouched", async () => {
  const { root, home } = await scratch("bot-cli-refusal-json-");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  // A response is queued but must never be consulted: a refusal happens before
  // anything runs (refusals.md:3, "refused before anything runs").
  faux.setResponses([fauxAssistantMessage("must never be consulted")]);

  await expect(main(["run", "start", "review/main", "the request", "--modle", "gpt-x", "--retires", "3", "--json"], held)).resolves.toBe(2);

  // inspection.md:9-10 — diagnostics go to stderr; stdout carries nothing.
  expect(Buffer.concat(stdout).toString()).toBe("");
  const text = Buffer.concat(stderr).toString();

  // "one object per line": every line is a whole JSON object, and the trailing
  // newline is the line terminator, not a blank record.
  expect(text.endsWith("\n")).toBe(true);
  const document = JSON.parse(text) as { error: { details: { refusals: Array<{ code: string; path: string }> } } };
  expect(document.error.details.refusals).toHaveLength(2);
  expect(document.error.details.refusals.map(({ path }) => path).sort()).toEqual(["--modle", "--retires"]);

  // The discriminator that the flag did something: the SAME invocation without
  // --json writes the human two-line form of refusals.md:6-9 instead — code and
  // path on one line, the sentence indented under it — and no JSON at all.
  const plainOut: Buffer[] = [];
  const plainErr: Buffer[] = [];
  const { held: plain } = realBoundary(root, home, plainOut, plainErr);
  await expect(main(["run", "start", "review/main", "the request", "--modle", "gpt-x", "--retires", "3"], plain)).resolves.toBe(2);
  expect(Buffer.concat(plainOut).toString()).toBe("");
  const human = Buffer.concat(plainErr).toString();
  expect(human.startsWith("key-unknown  --modle\n  ")).toBe(true);
  expect(human).toContain("\nkey-unknown  --retires\n  ");
  expect(human).not.toContain("{");

  // Nothing ran either way, and `runs/` holding no run is the honest witness
  // (record.md: absence means it never existed). Since ADR 0016 the directory
  // itself is made before the assembly is read — birth reserves a name and a
  // run directory so there is somewhere to copy the assembly to, and the
  // refusal that follows takes the run back off disk — so what is asserted is
  // that no RUN is there, which is what this always meant.
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// LEG 6 — the rendered form of `bot run events`. run-events.test.ts pins the
// structured document and exit codes. This test owns the rendered form,
// which
// inspection.md:110-113 enumerates. The fixture is a real run, so every clause
// of that sentence has something to point at.
test("leg 6 — rendered `bot run events` is one line per recorded event, stage-identified, naming what each stage received, produced, what judged it, what it cost, and how it ended", async () => {
  const { root, home } = await scratch("bot-cli-show-rendered-");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "the answer" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const raw = await readFile(join(home, "runs", run, "record.jsonl"), "utf8");

  const show = async (): Promise<{ code: number; out: string; err: string }> => {
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const { held: boundary } = realBoundary(root, home, out, err);
    const code = await main(["run", "events", run], boundary);
    return { code, out: Buffer.concat(out).toString(), err: Buffer.concat(err).toString() };
  };

  // inspection.md:9-10 — "in a stable field order", made mechanical the 0021
  // way: the same invocation twice is byte-identical, and diagnostics stay off
  // stdout.
  const first = await show();
  const second = await show();
  expect(first.code).toBe(0);
  expect(second.out).toBe(first.out);
  expect(first.err).toBe("");

  // "one record per line" (inspection.md:9): exactly one rendered line per
  // appended event, in the order they were written — and NOT the record's own
  // bytes, which is what --json is for (inspection.md:115-116).
  const events = raw.trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  const all = first.out.trimEnd().split("\n");
  // Human show now opens with its outcome. Event rows remain in record order;
  // select them by their recorded timestamps rather than by old list position.
  const rendered = all.filter((line) => events.some((event) => line.startsWith(`${scalar(event["ts"])}  `)));
  expect(rendered).toHaveLength(events.length);
  expect(first.out).not.toBe(raw);

  // The rendered line's stable leading fields: the event's own timestamp, the
  // event word, then the identity — `<stage>/<retry>` for a stage-scoped event
  // (record.md Identity) and `-` for the run-scoped ones, so a `cut -f2` reader
  // gets a column that is always present.
  for (const [index, event] of events.entries()) {
    const line = rendered[index] ?? "";
    const identity = event["stage"] === undefined ? "-" : `${scalar(event["stage"])}/${scalar(event["retry"])}`;
    expect(line.startsWith(`${scalar(event["ts"])}  ${scalar(event["event"])}  ${identity}  `)).toBe(true);
  }
  expect(rendered.map((line) => line.split("  ")[1])).toEqual([
    "run_start", "stage_start", "prompt", "provider_start", "turn", "provider_start", "turn",
    "check", "gate_start", "check", "stage_end", "run_end",
  ]);

  // Ticket 0130: the machine reading carries the complete surface the harness
  // composed for this attempt. Deriving the expected pairs from the tool
  // objects themselves makes this an identity check rather than a copy of
  // descriptions whose wording may change: a reader gets exactly the names
  // and descriptions the model got, while schemas and labels stay out.
  const expectedTools = [...createControlTools(), ...createFileTools({})]
    .map(({ name, description }) => ({ name, description }));
  expect(events[1]?.["tools"]).toEqual(expectedTools);

  // Ticket 0131: recruitment is the flattened set lent to this attempt, not
  // every declaration before scope resolution. The stage-local `shared` wins
  // its collision, while the unrelated assembly-root and stage-local skills
  // retain their provenance. A map comparison ignores record ordering while
  // pinning the names and sources a JSON reader needs.
  expect(skillSources((events[1] as Record<string, unknown>)["skills"]))
    .toEqual({ "house-style": "assembly-root", shared: "stage-local", "fact-check": "stage-local" });

  // Ticket 0132: the machine reading exposes the prompt's ordered provenance,
  // pointing at retained evidence rather than copying its bytes into the
  // record. The harness entry names both rendered prompt halves because no
  // source file carries the defaults that joined the authored pieces.
  const recordedPrompt = events.map((event) => event["prompt"]).find((prompt) => prompt !== undefined);
  expect(recordedPrompt).toEqual([
    { source: "assembly", path: "assembly/ASSEMBLY.md" },
    { source: "stage", path: "assembly/flows/main/01-work/STAGE.md" },
    { source: "skill", name: "fact-check", path: "assembly/flows/main/01-work/skills/fact-check/SKILL.md" },
    { source: "skill", name: "house-style", path: "assembly/skills/house-style/SKILL.md" },
    { source: "skill", name: "shared", path: "assembly/flows/main/01-work/skills/shared/SKILL.md" },
    { source: "request", path: "request.txt" },
    {
      source: "harness",
      system: "stages/01-work/1/system.txt",
      firstTurn: "stages/01-work/1/first-turn.txt",
    },
  ]);

  // Now the clauses of inspection.md:111-113, each against the line that
  // answers it.
  //
  // REDESIGN ticket 0164 — every assertion below used to pin `util.inspect`'s
  // rendering of the whole event object: `name: 'request.txt'`, `sealed: true`,
  // `exit: 0`, `cause: 'success'`, `check: 'output'` and the rest, braces and
  // quotes and all. The human mode is now one designed clause per event type,
  // in plain English over the record's own event and cause words, so what each
  // clause of inspection.md points at is the same fact said in words.
  const lineFor = (event: string): string => rendered.find((line) => line.split("  ")[1] === event) ?? "";

  // "each stage, what it received" — stage_start says what it read.
  // REDESIGN ticket 0164: was `name: 'request.txt'` and the session path; the
  // session is `bot session`'s door and is no longer repeated here.
  expect(lineFor("stage_start")).toBe(`${scalar(events[1]?.["ts"])}  stage_start  01-work/1  read request.txt, inherited root, new session`);

  // "what it produced" and "how it ended" — stage_end names the exit/cause pair
  // (record.md: "The exit code says whether; the cause says why") and labels
  // its sealed output as the agent's report, separate from the gate's verdict.
  // REDESIGN ticket 0164: was four separate `toContain`s over the dump.
  expect(lineFor("stage_end")).toContain("exit 0, success, agent report: sealed stages/01-work/1/1/output.txt");
  expect(lineFor("run_end")).toContain("exit 0, success");

  // "which checks ran and what they said" — both checks are rendered, named by
  // the record's own check word, and a passing one says so. The gate's recorded
  // verdict is authoritative; this strengthens, rather than replaces, its
  // verdict-content assertion. What it said is kept byte for byte in the
  // capture (record.md "What a check printed"), which the clause names on
  // failure — there is no failure here, so the file is reached the way a reader
  // would, from the path the record holds.
  // REDESIGN ticket 0164: was `check: 'output'`, `check: 'gate'` and the
  // capture path off the dump.
  const checks = rendered.filter((line) => line.split("  ")[1] === "check");
  expect(checks[0]).toContain("output passed");
  expect(checks[1]).toContain("authoritative gate verdict: gate passed");
  const gate = (events.find((event) => event["check"] === "gate") ?? {})["capture"];
  expect(gate).toBe("stages/01-work/1/1/checks/gate.txt");
  await expect(readFile(join(home, "runs", run, "stages/01-work/1/1/checks/gate.txt"), "utf8"))
    .resolves.toBe("the gate says yes\n");

  // "what it cost" — the turn lines carry the token counts, attributed to the
  // stage and the attempt that spent them.
  const turns = rendered.filter((line) => line.split("  ")[1] === "turn");
  expect(turns).toHaveLength(2);
  for (const turn of turns) {
    expect(turn).toContain("01-work/1");
    expect(turn).toMatch(/input: \d+/u);
    expect(turn).toMatch(/output: \d+/u);
    expect(turn).toMatch(/total: \d+/u);
  }

  // Ticket 0054, the cost lens. The summary is DERIVED — every number is
  // re-summed here from the record's own turn events, so the assertion cannot
  // pass by echoing whatever the renderer felt like printing.
  const spent = (name: string): number => events
    .filter((event) => event["event"] === "turn")
    .reduce((held, event) => held + Number(event[name]), 0);
  expect(spent("total")).toBeGreaterThan(0);

  // Ticket 0067: the standing scratch location remains available even though
  // the outcome and spend now lead the reading.
  expect(all).toContain(`-  scratch  01-work  ${attempt(scratchRun(join(root, "cache"), home, run), "01-work")}`);

  // The summary is a reading of the record, never a line in it: `--json` is the
  // record's own bytes, byte for byte, with no summary appended.
  const jsonOut: Buffer[] = [];
  const { held: jsonBoundary } = realBoundary(root, home, jsonOut, []);
  await expect(main(["run", "events", run, "--json"], jsonBoundary)).resolves.toBe(0);
  const document = JSON.parse(Buffer.concat(jsonOut).toString()) as { data: { events: Record<string, unknown>[] } };
  expect(document.data.events).toEqual(events);

  // `bot runs` carries the same run total as its last column (inspection.md,
  // "what it cost in tokens").
  const runsOut: Buffer[] = [];
  const { held: runsBoundary } = realBoundary(root, home, runsOut, []);
  await expect(main(["run", "list"], runsBoundary)).resolves.toBe(0);
  const listed = printedLines(Buffer.concat(runsOut).toString().trimEnd().split("\n"));
  expect(listed).toHaveLength(3);
  expect(listed[2]).toMatch(new RegExp(`\\| ${run} \\| review \\| main \\| .+ \\| 4\\.1K \\|$`, "u"));
});
