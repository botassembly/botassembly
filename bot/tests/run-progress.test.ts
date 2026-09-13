// Ticket 0134 leg 1 — a live run says where it is. Until this ticket a run was
// silent from the moment it started to the moment it answered: twenty seconds
// for a toy, minutes for a six-stage flow, and the playtest's reader read the
// silence as a hang. One line to stderr as each stage starts, in the stage's
// own identity — the string `bot check`'s plan prints and the record's
// `stage_start` carries, never a display name minted beside them (invariant 20).
//
// Red first, all three: today stderr is empty for the whole run.
//
// It is a DISPLAY, so it goes to a terminal and nowhere else — the third test
// is that half, and it is why the 96 assertions across 34 files that pin a
// successful run's stderr EMPTY are still true rather than rewritten. What a
// pipe, a redirect or a CI log receives is byte for byte what it received
// before this existed; a run's actual diagnostics — the cause line, refusals —
// are unconditional and untouched by any of this.
//
// The second test is the pin the ticket requires: stdout is BYTE-IDENTICAL to
// what it was before progress existed. It is asserted against the sealed output
// file on disk rather than against a literal, so it fails for the one reason it
// exists to catch — a progress line that reached the answer's stream — and
// cannot pass by agreeing with a hard-coded string that itself drifted.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { events, realBoundary, runsIn, sealedOutput, tempRoots, writes, type Message } from "./cli-boundary.ts";

const roots = tempRoots();

afterEach(() => roots.cleanup());

// A stage, a LOOP of two repeats, and a tail stage: three names and one of them
// twice, which is what makes the ORDER of the lines assertable and what shows
// a repeat is distinguishable from the repeat before it.
async function assembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(join(flow, "02-cycle"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-read.md"), "---\n---\nRead the request.\n"),
    writeFile(join(flow, "02-cycle/LOOP.md"), "---\nrepeat: 2\n---\n"),
    writeFile(join(flow, "02-cycle/01-work.md"), "---\n---\nRevise the draft.\n"),
    writeFile(join(flow, "03-tail.md"), "---\n---\nWrite the answer.\n"),
  ]);
}

const answers = (content: string): Message[] => [writes("$OUTPUT", content), fauxAssistantMessage("done")];

async function ran(prefix: string, stdout: Buffer[], stderr: Buffer[], watching = true): Promise<string> {
  const { root, home } = await roots.scratch(prefix);
  await assembly(home);
  const { held, faux } = realBoundary(root, home, stdout, stderr, watching);
  faux.setResponses([
    ...answers("read"), ...answers("draft one"), ...answers("draft two"), ...answers("the final answer"),
  ]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  return join(home, "runs", (await runsIn(home))[0] ?? "");
}

test("a run names each stage on stderr as it starts, in order, repeats apart", async () => {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  await ran("bot-progress-", stdout, stderr);
  expect(Buffer.concat(stderr).toString().split("\n")).toEqual([
    "01-read", "02-cycle/01-work#1", "02-cycle/01-work#2", "03-tail", "",
  ]);
});

test("stdout stays exactly the sealed answer while progress flows on stderr", async () => {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const run = await ran("bot-progress-stdout-", stdout, stderr);
  // Progress was flowing — without this the pin below passes on a run that
  // printed nothing anywhere and proves nothing about the two streams.
  expect(Buffer.concat(stderr).length).toBeGreaterThan(0);
  const sealed = sealedOutput(await events(join(run, "record.jsonl")), "03-tail");
  const bytes = await readFile(join(run, ...sealed.path.split("/")));
  expect(Buffer.concat(stdout).equals(bytes)).toBe(true);
  // And the sealed bytes are the answer as authored: no terminator was added
  // for the terminal, so a pipe and a screen receive the same file.
  expect(bytes.toString()).toBe("the final answer");
});

test("nothing is watching: the same run says nothing on stderr and answers the same bytes", async () => {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const run = await ran("bot-progress-piped-", stdout, stderr, false);
  expect(Buffer.concat(stderr).toString()).toBe("");
  const sealed = sealedOutput(await events(join(run, "record.jsonl")), "03-tail");
  expect(Buffer.concat(stdout).equals(await readFile(join(run, ...sealed.path.split("/"))))).toBe(true);
});
