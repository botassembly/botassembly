// Ticket 0120, ceiling two — 16 MiB of combined stdout and stderr per gate or
// hook, Ian's ruling of 2026-08-05. Crossing it is the assembly being wrong,
// the same shape as the hang runtime.md already names: the child is
// terminated, the run exits 2 with cause `fault`, and the record's sentence
// names the file and the ceiling.
//
// The fixture writes the real ceiling rather than injecting a smaller one:
// 16 MiB through a pipe and onto disk is ~50 ms measured, so the honest number
// is also the cheap one, and no test seam has to exist in `runProcess` at all.
// Half of it goes to stdout and half to stderr, because the ceiling is on the
// two combined and nothing else here would say so.
//
// Nothing here reaches a model or the real ~/.pi, ~/.cache or ~/.local/share.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { chmod, mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { at, events, realBoundary, runsIn, tempRoots, writes } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

const CAP = 16 * 1024 * 1024;
const ASSEMBLY = "---\nintelligence: default\n---\nReview assembly.\n";

/** A gate that prints `out` bytes to stdout and `err` bytes to stderr, then
 *  passes. `tr` off /dev/zero is bytes without a file to hold them. */
function loudGate(out: number, err: number): string {
  return [
    "#!/bin/sh",
    `head -c ${String(out)} /dev/zero | tr '\\0' a`,
    `head -c ${String(err)} /dev/zero | tr '\\0' b >&2`,
    "exit 0",
  ].join("\n") + "\n";
}

async function runWithGate(prefix: string, gate: string) {
  const { root, home } = await roots.scratch(prefix);
  const base = join(home, "assemblies/review");
  await mkdir(join(base, "flows/main/01-parent"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), ASSEMBLY),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-parent/STAGE.md"), "---\n---\nParentmarker: do the work.\n"),
    writeFile(join(base, "flows/main/01-parent/gate.sh"), gate),
  ]);
  await chmod(join(base, "flows/main/01-parent/gate.sh"), 0o755);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "the answer"), fauxAssistantMessage("done")]);
  const exit = await main(["run", "start", "review/main", "the request"], held);
  const run = at(await runsIn(home), 0);
  return { home, run, exit, errors: Buffer.concat(stderr).toString() };
}

/** The capture the gate's check event points at, and its size on disk. */
async function gateCapture(home: string, run: string): Promise<{ path: string; bytes: number }> {
  const record = await events(join(home, "runs", run, "record.jsonl"));
  const check = record.find((event) => event["event"] === "check" && event["check"] === "gate");
  const path = String(check?.["capture"]);
  return { path, bytes: (await stat(join(home, "runs", run, path))).size };
}

test("a gate whose combined output is exactly 16 MiB passes, and the capture holds every byte", async () => {
  const held = await runWithGate("bot-ceiling-at-", loudGate(CAP / 2, CAP / 2));
  expect([held.exit, held.errors]).toEqual([0, ""]);
  expect(await gateCapture(held.home, held.run)).toMatchObject({ bytes: CAP });
});

test("a gate one byte past 16 MiB ends the run: exit 2, fault, the file and the ceiling named", async () => {
  const held = await runWithGate("bot-ceiling-past-", loudGate(CAP / 2, CAP / 2 + 1));
  expect(held.exit).toBe(2);
  expect(held.errors)
    .toBe("fault: flows/main/01-parent/gate.sh wrote past the 16 MiB output ceiling.\n");
  // The capture keeps what arrived before the cut — the ceiling exactly, so
  // the agent's feedback and the record stay honest about what was seen.
  expect(await gateCapture(held.home, held.run)).toMatchObject({ bytes: CAP });
});
