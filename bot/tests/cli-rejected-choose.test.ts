// Ticket 0043 — pin queue P1, two dead zones. (1) A success hook that runs
// cleanly and exits non-zero drives the run to cause "rejected" (stage.md exit
// table; hooks.md "Exit codes": "Either way the cause is `rejected`"). (2) A
// CHOOSE node executes through the real flow runner with real defaultGating:
// the chose event, the selected branch running, the declined one absent
// (choose.md "In the record"). These tests drive the REAL defaultGating via
// main() with the faux provider — the cli-stage-options idiom (0041).
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

async function record(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

// A folder-form stage whose success hook runs cleanly and exits 3 — the
// "assembly's own machinery said no" leg (stage.md exit table: "a hook ran
// cleanly and exited non-zero: the stage working as designed, the work
// rejected").
async function rejectedAssembly(home: string): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-work");
  await mkdir(stage, { recursive: true });
  const hook = join(stage, "success");
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nDo the work.\n"),
    writeFile(hook, "#!/bin/sh\necho 'the machinery says no'\nexit 3\n"),
  ]);
  await chmod(hook, 0o755);
}

test("a success hook exiting non-zero produces the rejected state shown in runs help", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-rejected-"));
  roots.push(root);
  const home = join(root, "home");
  await rejectedAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "the answer" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);

  // stage.md exit table: exit 1 is "the stage working as designed, the work
  // rejected"; the flow exits with that same code.
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(1);
  // On success only does the run's output reach stdout (runtime.md); the
  // cause and reason go to stderr.
  expect(Buffer.concat(stdout).toString()).toBe("");
  expect(Buffer.concat(stderr).toString()).toContain("rejected");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));

  // hooks.md: "Whatever a hook prints on stdout and stderr is captured as
  // diagnostics and kept with the run."
  const hook = events.find((event) => event["event"] === "hook");
  expect(hook).toMatchObject({ hook: "success", exit: 3, stage: "01-work", retry: 1, capture: "stages/01-work/1/1/hooks/success.txt" });
  await expect(readFile(join(home, "runs", run, "stages/01-work/1/1/hooks/success.txt"), "utf8"))
    .resolves.toBe("the machinery says no\n");

  // hooks.md exit codes: "`success` exiting non-zero fails a stage whose
  // output had already passed every check. Either way the cause is
  // `rejected`" — the checks judged the output, so judged is true, and the
  // window between passing and sealing was never crossed, so sealed is false.
  const end = events.find((event) => event["event"] === "stage_end");
  expect(end).toMatchObject({ stage: "01-work", exit: 1, cause: "rejected", judged: true, sealed: false });

  // record.md cause table: rejected / exit 1 — "the assembly's own machinery
  // said no". One run_end, and it says rejected.
  const runEnds = events.filter((event) => event["event"] === "run_end");
  expect(runEnds).toEqual([expect.objectContaining({ exit: 1, cause: "rejected" })]);

  stdout.length = 0;
  stderr.length = 0;
  await expect(main(["run", "list", "--help"], held)).resolves.toBe(0);
  const documented = "ended";

  stdout.length = 0;
  stderr.length = 0;
  await expect(main(["run", "list", "--state", documented], held)).resolves.toBe(0);
  expect(Buffer.concat(stdout).toString()).toContain(run);
  expect(Buffer.concat(stderr).toString()).toBe("");
});

// choose.md: alternatives are named files or folders listed in the body as
// code spans at the start of top-level list items. A sequence never ends in a
// container (graph.md "The last entry of a sequence is a stage"), so the flow
// carries a stage after the choice, and the branch's output reaches it named
// after the alternative (choose.md "Input and output").
async function chooseAssembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(join(flow, "01-decide"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-decide/CHOOSE.md"), "---\n---\nPick the smaller safe action.\n\n- `patch` — the problem is small and mechanical\n- `revert` — the change should not have landed\n"),
    writeFile(join(flow, "01-decide/patch.md"), "---\n---\nWrite the fix.\n"),
    writeFile(join(flow, "01-decide/revert.md"), "---\n---\nRevert the change.\n"),
    writeFile(join(flow, "02-report.md"), "---\n---\nReport what was done.\n"),
  ]);
}

test("a CHOOSE node through the real flow runner: the chose event, only the selected branch runs, the chooser has a ladder and no output", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-choose-"));
  roots.push(root);
  const home = join(root, "home");
  await chooseAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    // The chooser names its choice with the `select` control tool (choose.md
    // "Who chooses"); a valid selection terminates the turn.
    fauxAssistantMessage([fauxToolCall("select", { name: "patch", reason: "small and mechanical" })], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "patched it" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("patch done"),
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "report ready" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("report done"),
  ]);

  // flow.md: a flow's output is its last stage's output; on success it goes
  // to stdout (runtime.md).
  const code = await main(["run", "start", "review/main", "the request"], held);
  expect(code, Buffer.concat(stderr).toString()).toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("report ready");

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const events = await record(join(home, "runs", run, "record.jsonl"));

  // record.md: "what a `CHOOSE` chose and what it declined"; choose.md "In
  // the record": what was chosen, what else was available, and the reason.
  const chose = events.filter((event) => event["event"] === "chose");
  expect(chose).toEqual([expect.objectContaining({
    stage: "01-decide", retry: 1, chose: "patch", declined: ["revert"], reason: "small and mechanical",
  })]);
  expect(chose[0]).not.toHaveProperty("via");

  // The selected alternative ran; the declined one left no events at all
  // (record.md: absence means the thing never existed). The alternative is a
  // folder in the identity path (record.md "Identity").
  expect(events.filter((event) => event["event"] === "stage_start" && event["stage"] === "01-decide/patch")).toHaveLength(1);
  expect(events.filter((event) => typeof event["stage"] === "string" && event["stage"].startsWith("01-decide/revert"))).toEqual([]);

  // Ticket 0041: the chooser's own stage_start carries its resolved ladder.
  const chooser = events.find((event) => event["event"] === "stage_start" && event["stage"] === "01-decide");
  expect(chooser).toBeDefined();
  expect(chooser?.["options"]).toContainEqual({ name: "model", value: "faux-1", rung: "assembly" });

  // choose.md: the chooser has "no `$OUTPUT`, because a choice is not an
  // output". The 0034 pin holds the slot/env seam at unit level; e2e the
  // visible facts are the record and the run directory: the chooser's
  // stage_end carries no output, no output file was ever minted for it (its
  // attempt directory was never even created), while the selected branch's
  // sealed output is on disk.
  const chooserEnd = events.find((event) => event["event"] === "stage_end" && event["stage"] === "01-decide");
  expect(chooserEnd).toMatchObject({ exit: 0, cause: "success" });
  expect(chooserEnd).not.toHaveProperty("output");
  await expect(readFile(join(home, "runs", run, "stages/01-decide/1/1/output.txt"), "utf8")).rejects.toThrow();
  await expect(readFile(join(home, "runs", run, "stages/01-decide/patch/1/1/output.txt"), "utf8"))
    .resolves.toBe("patched it");

  // choose.md "Input and output": the next stage receives the alternative's
  // output "named after the alternative" — `$INPUT/escalate.json` in the
  // spec's example, so the filename carries the producing stage's extension.
  const report = events.find((event) => event["event"] === "stage_start" && event["stage"] === "02-report");
  expect(report?.["received"]).toContainEqual(expect.objectContaining({ name: "patch.txt", path: "stages/01-decide/patch/1/1/output.txt" }));
});
