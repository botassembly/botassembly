// Invariant 14 at the runtime level, both halves: the rehash BEFORE an
// executable runs, and the rehash at SEALING. Ticket 0061 wrote these; ticket
// 0117 moved them out of cli-gate-folder-faults.test.ts. The split is by
// subject: that file is about the gate FOLDER — order, naming, 126/127 — and
// these two are about hashes.
//
// The move also drops that file's private `realBoundary`, `record` and clock,
// which were byte-identical to `cli-boundary.ts`'s (CHECKLIST 9); nothing here
// is retyped.
//
// The assertion sources, unchanged from 0061:
// - record.md "Hashes": "An agent read its failure feedback, found the gate,
//   rewrote it to exit zero, and passed. Ending the run is the response."; "A
//   hash that disagrees with the one taken when the assembly was read ends the
//   run: exit 2, this line naming the file."
// - record.md "Hashes" / hooks.md: the output "is hashed the moment its checks
//   pass, and bytes that differ when it is sealed end the run the same way a
//   drifted gate does — the window between passing and sealing is not a place
//   bytes may change, not for a `success` hook."
//
// REDESIGNED by ticket 0117 in the first test only, ruled by ADR 0016 step 4
// (the capture is sealed) and step 8 (a gate is executed from the capture):
//   - The gate runs `chmod u+w "$0"` before rewriting itself, because `$0` is
//     now the capture's read-only copy. That is the ADR's own sentence made
//     executable — the seal is "a tripwire, not a wall", a determined program
//     still gets through it, and invariant 14 is still what catches the program
//     that did. Without the chmod there would be no drift to witness.
//   - The closing assertion flipped from "the SOURCE holds the rewritten bytes"
//     to "the CAPTURE holds them and the source is untouched": the same proof
//     that the rewrite happened, plus the proof of which path was executed.
// No assertion was weakened, and nothing about the second test changed.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { hashBytes } from "../src/record.ts";
import { at, events, realBoundary, runsIn, tempRoots, writes } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

/** One folder-form stage, one gate FILE, and the hooks the caller asks for. */
async function gateAssembly(
  home: string, gate: string, hooks: Partial<Record<"success", string>> = {},
): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-work");
  await mkdir(stage, { recursive: true });
  const named = Object.entries(hooks);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nDo the work.\n"),
    writeFile(join(stage, "gate"), gate),
    ...named.map(([name, script]) => writeFile(join(stage, name), script)),
  ]);
  await Promise.all(["gate", ...named.map(([name]) => name)].map((name) => chmod(join(stage, name), 0o755)));
}

function gateChecks(held: Record<string, unknown>[]): Record<string, unknown>[] {
  return held.filter((event) => event["event"] === "check" && event["check"] === "gate");
}

test("rehash before running: a gate that rewrites itself between attempts ends the run — hash_drift names the gate, 2/fault, no third attempt", async () => {
  const { root, home } = await roots.scratch("bot-cli-gate-rehash-");
  // Attempt 1: the gate says no (so the agent is held) and rewrites itself into
  // a gate that would say yes. Attempt 2 never runs it: the hash taken when the
  // assembly was read disagrees with the bytes on disk.
  await gateAssembly(home, "#!/bin/sh\nchmod u+w \"$0\"\nprintf '#!/bin/sh\\nexit 0\\n' > \"$0\"\necho 'the gate says no, for now'\nexit 1\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "the work"), fauxAssistantMessage("done"), fauxAssistantMessage("nothing changed")]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stdout).toString()).toBe("");
  expect(Buffer.concat(stderr).toString()).toContain("fault");
  const run = at(await runsIn(home), 0);
  const record = await events(join(home, "runs", run, "record.jsonl"));

  // Attempt 1's gate really ran and said no; attempt 2's never ran, so there is
  // exactly one gate check. Two attempts, not three: the drift is terminal.
  expect(gateChecks(record)).toEqual([expect.objectContaining({ retry: 1, exit: 1, file: "flows/main/01-work/gate" })]);
  expect(record.filter((event) => event["event"] === "hash_drift"))
    .toEqual([expect.objectContaining({ file: "flows/main/01-work/gate" })]);
  const starts = record.filter((event) => event["event"] === "stage_start" && event["stage"] === "01-work");
  expect(starts.map((event) => event["retry"])).toEqual([1, 2]);
  const end = record.find((event) => event["event"] === "stage_end" && event["stage"] === "01-work");
  expect(end).toMatchObject({ retry: 2, exit: 2, cause: "fault", sealed: false });
  expect(String(end?.["reason"])).toContain("flows/main/01-work/gate");
  expect(record.filter((event) => event["event"] === "run_end"))
    .toEqual([expect.objectContaining({ exit: 2, cause: "fault" })]);
  // The rewrite really happened, so the drift is the runtime's judgment rather
  // than a fixture that never changed anything — and it happened to the CAPTURE,
  // which is the proof that the path the runtime ran was the run's own copy. The
  // authored assembly never saw the agent's gate at all.
  await expect(readFile(join(home, "runs", run, "assembly/flows/main/01-work/gate"), "utf8"))
    .resolves.toBe("#!/bin/sh\nexit 0\n");
  await expect(readFile(join(home, "assemblies/review/flows/main/01-work/gate"), "utf8"))
    .resolves.toContain("the gate says no, for now");
});

test("rehash at sealing: a success hook that rewrites $OUTPUT after the checks pass is drift — hash_drift names the output, the run fails 2/fault, nothing is sealed", async () => {
  const { root, home } = await roots.scratch("bot-cli-gate-drift-");
  // This hook exits 0 — the drift verdict owes nothing to its exit code.
  await gateAssembly(home, "#!/bin/sh\nexit 0\n", { success: "#!/bin/sh\nprintf 'tampered' > \"$OUTPUT\"\nexit 0\n" });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "honest work"), fauxAssistantMessage("done")]);

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stdout).toString()).toBe("");
  expect(Buffer.concat(stderr).toString()).toContain("fault");

  const run = at(await runsIn(home), 0);
  const record = await events(join(home, "runs", run, "record.jsonl"));

  // The checks passed on the honest bytes; the hook ran, cleanly by its own
  // account (exit 0, its event recorded like any hook's).
  expect(gateChecks(record)).toEqual([expect.objectContaining({ retry: 1, exit: 0 })]);
  expect(record.filter((event) => event["event"] === "hook" && event["hook"] === "success")).toEqual([
    expect.objectContaining({ retry: 1, exit: 0, capture: "stages/01-work/1/1/hooks/success.txt" }),
  ]);

  // The hash_drift line names the output file with both hashes — expected is the
  // hash of what passed, actual is the hash of what the hook left.
  expect(record.filter((event) => event["event"] === "hash_drift")).toEqual([
    expect.objectContaining({
      file: "stages/01-work/1/1/output.txt",
      expected: hashBytes(Buffer.from("honest work")),
      actual: hashBytes(Buffer.from("tampered")),
    }),
  ]);

  // "What passed the checks is what is sealed, always" — so nothing is: the
  // stage ends 2/fault, sealed false, and the run follows.
  const end = record.find((event) => event["event"] === "stage_end" && event["stage"] === "01-work");
  expect(end).toMatchObject({ retry: 1, exit: 2, cause: "fault", sealed: false });
  expect(String(end?.["reason"])).toContain("Output changed after its checks passed");
  expect(record.filter((event) => event["event"] === "run_end")).toEqual([
    expect.objectContaining({ exit: 2, cause: "fault" }),
  ]);
});
