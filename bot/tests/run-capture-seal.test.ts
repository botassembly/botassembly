// Ticket 0117 — the seal, deletion of a sealed run, invariant 14 over the
// capture, and the subflow family's one capture.
//
// ADR 0016 step 4: "The capture is runtime-owned and made non-writable after
// sealing. That is a tripwire, not a wall: the spec is explicit that hiding
// paths is obscurity, not a sandbox (invariants 3/34-37), and this ADR claims no
// security boundary." Step 7: "Subflow child runs execute from the parent's
// capture. One capture per top-level run."
//
// The seal is on FILES and not on directories, and the third test here is why:
// a non-writable directory would stop `rm` from unlinking what is inside it, so
// `bot prune --delete` — and a person's own `rm -rf` — would meet EACCES on a
// run they own. Read-only files unlink exactly as writable ones do.
//
// The other half of invariant 14's move lives in run-capture-execution.test.ts:
// a gate edited in the SOURCE after the capture is harmless there (witness 5).
// Here is the half that still ends the run — the CAPTURED gate, edited.
//
// Nothing here reaches a model or the real ~/.pi, ~/.cache or ~/.local/share.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { hashBytes } from "../src/record.ts";
import {
  at, callsSubflow, events, queue, realBoundary, router, runsIn, tempRoots, tree, writes,
} from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

const ASSEMBLY = "---\nintelligence: default\n---\nReview assembly.\n";
const GATE = "#!/bin/sh\nexit 0\n";
const OUTPUT = "the answer";

/** A stage with a gate, and a helper subflow whose own stage has a gate that
 *  prints the path it was executed from. */
async function sealedAssembly(home: string): Promise<string> {
  const base = join(home, "assemblies/review");
  await mkdir(join(base, "flows/main/01-parent"), { recursive: true });
  await mkdir(join(base, "subflows/helper/01-answer"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), ASSEMBLY),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-parent/STAGE.md"), "---\n---\nParentmarker: do the work.\n"),
    writeFile(join(base, "flows/main/01-parent/gate.sh"), GATE),
    writeFile(join(base, "subflows/helper/FLOW.md"), "---\ndescription: a helper flow\n---\n"),
    writeFile(join(base, "subflows/helper/01-answer/STAGE.md"), "---\n---\nChildmarker: answer.\n"),
    // `$0` is the path the runtime executed, and the record keeps what a passing
    // gate printed without ever showing it to the agent (gate.md "The verdict").
    writeFile(join(base, "subflows/helper/01-answer/gate.sh"), "#!/bin/sh\necho \"$0\"\nexit 0\n"),
  ]);
  await Promise.all([
    chmod(join(base, "flows/main/01-parent/gate.sh"), 0o755),
    chmod(join(base, "subflows/helper/01-answer/gate.sh"), 0o755),
  ]);
  return base;
}

const CAPTURED = [
  "ASSEMBLY.md",
  "flows/main/01-parent/STAGE.md",
  "flows/main/01-parent/gate.sh",
  "flows/main/FLOW.md",
  "subflows/helper/01-answer/STAGE.md",
  "subflows/helper/01-answer/gate.sh",
  "subflows/helper/FLOW.md",
];

/** The run finishes; the capture is sealed. Nothing calls the subflow. */
async function plainRun(prefix: string) {
  const { root, home } = await roots.scratch(prefix);
  await sealedAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", OUTPUT), fauxAssistantMessage("done")]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  const run = at(await runsIn(home), 0);
  return { root, home, run, capture: join(home, "runs", run, "assembly"), cache: join(root, "cache") };
}

// THE SEAL. Every captured file lost its write bits and kept everything else,
// the executable one included; the directories did not, on purpose.
test("the capture is sealed: every file non-writable, the gate still executable, the directories untouched", async () => {
  const held = await plainRun("bot-seal-");
  expect(await tree(held.capture)).toEqual(CAPTURED);
  for (const file of CAPTURED) {
    const mode = (await stat(join(held.capture, file))).mode;
    expect([file, mode & 0o222]).toEqual([file, 0]);
  }
  // The bit a gate's behavior depends on survived the seal (ADR 0016 step 3).
  expect((await stat(join(held.capture, "flows/main/01-parent/gate.sh"))).mode & 0o111).not.toBe(0);
  // Directories keep their write bit so the run directory stays removable.
  expect((await stat(join(held.capture, "flows/main"))).mode & 0o200).not.toBe(0);
  // A write in place is what the seal stops — the tripwire, doing its one job.
  await expect(writeFile(join(held.capture, "flows/main/01-parent/gate.sh"), "#!/bin/sh\nexit 0\n"))
    .rejects.toMatchObject({ code: "EACCES" });
});

// The gate runs from the captured assembly but has the live output path. Each
// failed attempt snapshots its candidate before the gate adds an exclamation.
// The exhausted record must retain that last candidate, not re-snapshot the
// unjudged write after the gate's final non-zero exit.
test("an exhausted gate rewrite keeps the last judged snapshot and records its drift", async () => {
  const { root, home } = await roots.scratch("bot-seal-exhausted-drift-");
  await sealedAssembly(home);
  const gate = join(home, "assemblies/review/flows/main/01-parent/gate.sh");
  await writeFile(gate, "#!/bin/sh\nprintf '%s!' \"$(cat \"$1\")\" > \"$1\"\nprintf 'not ready\\n'\nexit 1\n");
  await chmod(gate, 0o755);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    writes("$OUTPUT", OUTPUT),
    fauxAssistantMessage("first attempt complete"),
    fauxAssistantMessage("still unchanged"),
    fauxAssistantMessage("still unchanged"),
  ]);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(1);
  const run = at(await runsIn(home), 0);
  const record = await events(join(home, "runs", run, "record.jsonl"));
  const judged = `${OUTPUT}!!`;
  const drifted = `${judged}!`;
  const outputPath = "stages/01-parent/1/3/output.txt";
  const end = record.find((event) => event["event"] === "stage_end" && event["stage"] === "01-parent");

  // The last gate was handed `judged`; its later write is not allowed to become
  // a judged record output merely because the retry budget is now exhausted.
  expect(end).toMatchObject({
    exit: 1,
    cause: "exhausted",
    sealed: false,
    judged: true,
    output: { path: outputPath, sha256: hashBytes(judged) },
  });
  await expect(readFile(join(home, "runs", run, outputPath), "utf8")).resolves.toBe(judged);
  expect(record.filter((event) => event["event"] === "hash_drift")).toEqual([
    expect.objectContaining({ file: outputPath, expected: hashBytes(judged), actual: hashBytes(drifted) }),
  ]);
});


// INVARIANT 14, NOW OVER THE CAPTURE. The other side of witness 5 in
// run-capture-execution.test.ts: an edit the capture DID see still ends the run,
// exit 2, in the sentence it always used. The edit is made mid-run by the test,
// through the faux provider's own turn — which is the only honest way to reach
// the window between the hash and the execution — and it has to chmod first,
// which is the seal being a tripwire rather than a wall, stated as a fact.
test("the CAPTURED gate edited mid-run still ends the run: exit 2, Assembly executable changed", async () => {
  const { root, home } = await roots.scratch("bot-seal-drift-");
  await sealedAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  queue(faux, router({
    Parentmarker: async (round) => {
      if (round > 1) return fauxAssistantMessage("done");
      const run = at(await runsIn(home), 0);
      const gate = join(home, "runs", run, "assembly/flows/main/01-parent/gate.sh");
      await chmod(gate, 0o755);
      await writeFile(gate, "#!/bin/sh\nexit 0\n# tampered\n");
      return writes("$OUTPUT", OUTPUT);
    },
  }), 4);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString())
    .toBe("fault: Assembly executable changed: flows/main/01-parent/gate.sh\n");
  const run = at(await runsIn(home), 0);
  const record = await events(join(home, "runs", run, "record.jsonl"));
  expect(record.filter((event) => event["event"] === "hash_drift"))
    .toEqual([expect.objectContaining({ file: "flows/main/01-parent/gate.sh" })]);
  // The gate never ran: the rehash comes first (executables.ts).
  expect(record.filter((event) => event["event"] === "check" && event["check"] === "gate")).toEqual([]);
});

// ONE CAPTURE PER TOP-LEVEL RUN (step 7). The child holds no assembly of its
// own; it executes the parent's, and its record says whose bytes those are —
// the ORIGINAL assembly's name and the PARENT's capture hash.
test("a subflow child executes the parent's capture: its gate runs from the parent's run directory, and it captures nothing itself", async () => {
  const { root, home } = await roots.scratch("bot-seal-child-");
  await sealedAssembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  queue(faux, router({
    Parentmarker: (round) => round === 1
      ? callsSubflow([{ flow: "helper", input: "a question" }])
      : round === 2 ? writes("$OUTPUT", OUTPUT) : fauxAssistantMessage("done"),
    Childmarker: (round) => round === 1 ? writes("$OUTPUT", "the child's answer") : fauxAssistantMessage("done"),
  }), 10);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  const run = at(await runsIn(home), 0);
  const runDirectory = join(home, "runs", run);
  const childDirectory = join(runDirectory, "stages/01-parent/1/1/subflows/1");
  const child = await events(join(childDirectory, "record.jsonl"));
  // No second capture: the family has one, and it is the parent's.
  expect(existsSync(join(childDirectory, "assembly"))).toBe(false);
  const parentStart = at(await events(join(runDirectory, "record.jsonl")), 0);
  const childStart = at(child, 0);
  expect(childStart["assembly"]).toBe("review");
  expect(childStart["assembly_hash"]).toBe(parentStart["assembly_hash"]);

  // And the proof by execution: the child's gate printed the path it was run
  // from, and that path is inside the PARENT's run directory.
  const check = child.find((event) => event["event"] === "check" && event["check"] === "gate");
  expect(check).toMatchObject({ exit: 0, file: "subflows/helper/01-answer/gate.sh" });
  const printedPath = (await readFile(join(childDirectory, String(check?.["capture"])), "utf8")).trim();
  expect(printedPath).toBe(join(runDirectory, "assembly/subflows/helper/01-answer/gate.sh"));
});
