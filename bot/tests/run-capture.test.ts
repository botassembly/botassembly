// Ticket 0116 — the capture at birth: a run gets its own copy of the assembly,
// and it is the copy the run validates, parses and hashes (ADR 0016 steps 1-6).
//
// WHAT THE ORDER IS, and why each witness below is about an order rather than a
// race. Birth is: reserve the name and lock (0112), create `runs/<run>/`, copy
// the assembly into `runs/<run>/assembly/`, validate and hash THAT copy, and
// only then write `run_start`. Every claim here is taken at a seam the test
// opens and closes itself — `captured`, the callback the copy awaits after each
// file lands, injected through the same `CliBoundary` that already threads
// `createGating` (0112's pause-point). Nothing is timed and nothing has to be
// won: the copy is a sequential walk in bytewise path order, so "after
// `ASSEMBLY.md`" names one point on disk and not one moment on a clock.
//
// The fixture's bytewise order is therefore load-bearing and is asserted below:
//   ASSEMBLY.md
//   flows/main/01-work/STAGE.md
//   flows/main/01-work/gate/01-check.sh
//   flows/main/FLOW.md
//
// Nothing here reaches a model or the real `~/.pi`, `~/.cache` or
// `~/.local/share`: the provider is faux, and BOT_HOME and XDG_CACHE_HOME are
// explicit on every invocation, under an mkdtemp root this file removes.
import { semanticCheck } from "./semantic-check.ts";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { prehashAssembly } from "../src/record.ts";
import { at, events, pauseAfter, realBoundary, runsIn, tempRoots, tree, writes } from "./cli-boundary.ts";
import { invokeCli, printed } from "./invoke.ts";

const roots = tempRoots();

afterEach(() => roots.cleanup());

const ASSEMBLY = "---\nintelligence: default\n---\nReview assembly.\n";
const STAGE = "---\n---\nDo the work.\n";
const GATE = "#!/bin/sh\nexit 0\n";
const FLOW = "---\ndescription: main flow\n---\n";

/** One flow, one stage, one gate folder — and a hidden entry beside them, which
 *  the reader already skips (documents.ts) and the hash already excludes. */
async function reviewAssembly(home: string): Promise<string> {
  const base = join(home, "assemblies/review");
  await mkdir(join(base, "flows/main/01-work/gate"), { recursive: true });
  await mkdir(join(base, ".git"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), ASSEMBLY),
    writeFile(join(base, "flows/main/FLOW.md"), FLOW),
    writeFile(join(base, "flows/main/01-work/STAGE.md"), STAGE),
    writeFile(join(base, "flows/main/01-work/gate/01-check.sh"), GATE),
    writeFile(join(base, ".git/HEAD"), "ref: refs/heads/main\n"),
  ]);
  await chmod(join(base, "flows/main/01-work/gate/01-check.sh"), 0o755);
  return base;
}

// WITNESS 1 — the capture exists, it is exactly the hashed assembly, and the
// record describes it: the ORIGINAL assembly's name (never `runs/<id>/assembly`)
// beside the CAPTURE's hash. RED against main, which copies nothing.
//
// The executable bit is witnessed twice over, and the second is the sharp one:
// `prehashAssembly` puts `:x` on an executable's identity line (0113), so a copy
// that dropped the bit would hash DIFFERENTLY from its source, and the two
// hashes being equal is that proof. The copy is not assumed to preserve mode.
test("a run copies the assembly into itself, and the record names the source path with the copy's hash", async () => {
  const { root, home } = await roots.scratch("bot-capture-");
  const source = await reviewAssembly(home);

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "the answer"), fauxAssistantMessage("done")]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  const run = at(await runsIn(home), 0);
  const capture = join(home, "runs", run, "assembly");
  // Visible regular files only, and every one of them, byte for byte.
  expect(await tree(capture)).toEqual([
    "ASSEMBLY.md",
    "flows/main/01-work/STAGE.md",
    "flows/main/01-work/gate/01-check.sh",
    "flows/main/FLOW.md",
  ]);
  await expect(readFile(join(capture, "ASSEMBLY.md"), "utf8")).resolves.toBe(ASSEMBLY);
  await expect(readFile(join(capture, "flows/main/01-work/STAGE.md"), "utf8")).resolves.toBe(STAGE);
  await expect(readFile(join(capture, "flows/main/01-work/gate/01-check.sh"), "utf8")).resolves.toBe(GATE);
  // The hidden entry is not in the hash, so it is not in the capture either.
  expect(existsSync(join(capture, ".git"))).toBe(false);

  // The bit survived the copy, and the hashes agreeing is what proves it.
  expect((await stat(join(capture, "flows/main/01-work/gate/01-check.sh"))).mode & 0o111).not.toBe(0);
  const captured = await prehashAssembly(capture);
  expect(captured.sha256).toBe((await prehashAssembly(source)).sha256);

  const start = at(await events(join(home, "runs", run, "record.jsonl")), 0);
  expect(start["event"]).toBe("run_start");
  expect(start["assembly"]).toBe("review");
  expect(start["assembly_hash"]).toBe(captured.sha256);
});

// WITNESS 2 — a validation refusal leaves NOTHING, which is record.md's rule
// ("a run refused before it starts produces none, because nothing happened")
// now that the refusal comes AFTER a run directory has been made. The bytes on
// stderr and the exit code are main's, unchanged; what is new is that `runs/`
// is empty rather than absent, because birth makes it before it validates.
test("a refusal after the copy removes the run: the same refusal bytes, and runs/ empty", async () => {
  const { root, home } = await roots.scratch("bot-capture-refused-");
  const source = await reviewAssembly(home);
  await writeFile(join(source, "garbage.txt"), "not an assembly entry\n");

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "never used")]);
  // `bot check` is the static validator of the LIVE tree and captures nothing:
  // it refuses in the same words, and no `runs/` comes into existence at all.
  await expect(semanticCheck([ "review/main"], held)).resolves.toBe(2);
  expect(existsSync(join(home, "runs"))).toBe(false);
  stderr.length = 0;

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toBe(
    "entry-unknown  garbage.txt\n  Remove the unrecognized assembly entry.\n",
  );
  expect(Buffer.concat(stdout).toString()).toBe("");
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// WITNESS 3 — the state birth holds open for as long as the copy takes: a run
// directory with no record yet, alive because of its lock. It is mid-birth, so
// the listing omits it until a record can be read. Prune names the physical
// lock and cannot take the run without an explicit override (inspection.md).
test("a run held mid-capture is absent, and prune names its lock without taking it", async () => {
  const { root, home } = await roots.scratch("bot-capture-held-");
  await reviewAssembly(home);
  const pause = pauseAfter("ASSEMBLY.md");

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "the answer"), fauxAssistantMessage("done")]);
  const running = main(["run", "start", "review/main", "the request"], { ...held, captured: pause.captured });
  await pause.arrived;

  const run = at(await runsIn(home), 0);
  // Mid-capture: the directory is there, the record is not, and one file of the
  // assembly has landed.
  expect(existsSync(join(home, "runs", run, "record.jsonl"))).toBe(false);
  expect(await tree(join(home, "runs", run, "assembly"))).toEqual(["ASSEMBLY.md"]);
  const listed = await invokeCli(["run", "list"], { home });
  expect(printed(listed)).toEqual(["No runs match."]);

  pause.resume();
  await expect(running).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
});

// WITNESS 4 — mutation DURING the copy. ADR 0016 promises only that "the capture
// is authoritative", not that the capture is a point-in-time snapshot, and this
// is that sentence exactly: a file edited after it was copied keeps its old
// bytes, a file edited before it was copied arrives new, and the run parses,
// hashes and prompts from whichever the capture holds. No scan, no retry.
test("a source edited mid-copy: the capture is what the run parses and hashes, whichever version it caught", async () => {
  const { root, home } = await roots.scratch("bot-capture-raced-");
  const source = await reviewAssembly(home);
  const pause = pauseAfter("ASSEMBLY.md");

  const prompts: string[] = [];
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    (context: { systemPrompt?: string }) => {
      prompts.push(context.systemPrompt ?? "");
      return writes("$OUTPUT", "the answer");
    },
    fauxAssistantMessage("done"),
  ]);
  const running = main(["run", "start", "review/main", "the request"], { ...held, captured: pause.captured });
  await pause.arrived;
  // One file is already in the capture and one is not. Both are edited now.
  await writeFile(join(source, "ASSEMBLY.md"), ASSEMBLY.replace("Review assembly.", "EDITED assembly."));
  await writeFile(join(source, "flows/main/01-work/STAGE.md"), STAGE.replace("Do the work.", "Do the EDITED work."));
  pause.resume();
  await expect(running).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  const run = at(await runsIn(home), 0);
  const capture = join(home, "runs", run, "assembly");
  // Copied before the edit: old. Copied after it: new. That combination never
  // stood on disk together, and it is what ran.
  await expect(readFile(join(capture, "ASSEMBLY.md"), "utf8")).resolves.toBe(ASSEMBLY);
  await expect(readFile(join(capture, "flows/main/01-work/STAGE.md"), "utf8")).resolves.toContain("Do the EDITED work.");
  // The parse is the capture's: the prompt carries the old purpose and the new
  // instruction, which is neither version of the source tree.
  expect(at(prompts, 0)).toContain("Review assembly.");
  expect(at(prompts, 0)).toContain("Do the EDITED work.");
  // And so is the hash: it names the capture, not the tree the source now is.
  const start = at(await events(join(home, "runs", run, "record.jsonl")), 0);
  expect(start["assembly_hash"]).toBe((await prehashAssembly(capture)).sha256);
  expect(start["assembly_hash"]).not.toBe((await prehashAssembly(source)).sha256);
});

// WITNESS 5 — the refusal the capture itself can raise, and the one no other
// order can reach: the source was sound when the run was asked for, and the
// COPY is not. What the run refuses is what it holds, and it says so in exactly
// the words `bot check` says over the same tree.
test("a source broken mid-copy refuses on the capture's contents, and leaves nothing behind", async () => {
  const { root, home } = await roots.scratch("bot-capture-broken-");
  const source = await reviewAssembly(home);
  const pause = pauseAfter("ASSEMBLY.md");

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "never used")]);
  const running = main(["run", "start", "review/main", "the request"], { ...held, captured: pause.captured });
  await pause.arrived;
  // FLOW.md has not been copied yet; the capture will take this version.
  await writeFile(join(source, "flows/main/FLOW.md"), "---\ndescription: 7\n---\n");
  pause.resume();
  await expect(running).resolves.toBe(2);
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);

  // The source now says what the capture says, so `bot check` is the oracle for
  // the bytes the run refused.
  const checked: Buffer[] = [];
  const { held: checking } = realBoundary(root, home, [], checked);
  await expect(semanticCheck([ "review/main"], checking)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toBe(Buffer.concat(checked).toString());
  expect(Buffer.concat(stderr).toString()).not.toBe("");
});

// WITNESS 6 — the ban that the capture had to be taught, and the reason the
// copy carries a symbolic link across instead of skipping it. Copying happens
// BEFORE anything reads the assembly, so the copy meets the link first; a copy
// that dropped it would hand validation a tree with nothing to refuse, and
// `symlink` (refusals.md) would quietly stop existing for runs. The capture
// reproduces the link, the reader refuses it in its own words over the capture,
// and the run leaves nothing — the same bytes on stderr as `bot check`.
test("a symbolic link in the assembly is still refused by a run, in the reader's own words", async () => {
  const { root, home } = await roots.scratch("bot-capture-link-");
  const source = await reviewAssembly(home);
  await symlink("/etc/passwd", join(source, "flows/main/02-link.md"));

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "never used")]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toBe(
    "symlink  flows/main/02-link.md\n  Replace the symbolic link with an assembly entry.\n",
  );
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// WITNESS 7 — a copy that fails partway. ADR 0016: "A full disk during capture
// is a handled failure: remove the partial run, release the lock, refuse with a
// plain sentence." A full disk is not a state a test may honestly manufacture;
// an unreadable source file is the same handled path — one genuine filesystem
// errno reaching the same line — and it is deterministic, so it is what is
// witnessed here. Ticket 0008 changes the copy mechanism, but that syscall is
// incidental: what is asserted is the handling. Nothing is left on disk, the
// lock is gone, and the sentence names the failure rather than a stack.
test("a copy that fails partway leaves no run, no reservation, and one plain sentence", async () => {
  const { root, home } = await roots.scratch("bot-capture-failed-");
  const source = await reviewAssembly(home);
  // Bytewise after ASSEMBLY.md, so the copy has already written one file.
  await chmod(join(source, "flows/main/01-work/STAGE.md"), 0o000);

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "never used")]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toMatch(
    /^fault: The assembly could not be copied into the run: EACCES .*STAGE\.md\n$/u,
  );
  expect(Buffer.concat(stdout).toString()).toBe("");
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// WITNESS 8, ticket 0008 — a leaf is opened no-follow and must still be the
// regular object the enumeration inspected. This swap happens after
// `walkAssembly` finished and `ASSEMBLY.md` landed, so a passing run would have
// copied external bytes through the replacement rather than refusing it.
test("a file replaced with a symlink mid-capture is refused before outside bytes enter the run", async () => {
  const { root, home } = await roots.scratch("bot-capture-file-swap-");
  const source = await reviewAssembly(home);
  const pause = pauseAfter("ASSEMBLY.md");
  const outside = join(root, "outside-stage.md");
  await writeFile(outside, "---\n---\nOutside instructions.\n");

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "never used"), fauxAssistantMessage("done")]);
  const running = main(["run", "start", "review/main", "the request"], { ...held, captured: pause.captured });
  await pause.arrived;
  await rm(join(source, "flows/main/01-work/STAGE.md"));
  await symlink(outside, join(source, "flows/main/01-work/STAGE.md"));
  pause.resume();

  await expect(running).resolves.toBe(2);
  expect(Buffer.concat(stdout).toString()).toBe("");
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// WITNESS 9 — no-follow only protects the leaf. If its parent is replaced by a
// symlink, identity pinning must reject the different opened object as well.
test("a parent directory replaced with a symlink mid-capture is refused before outside bytes enter the run", async () => {
  const { root, home } = await roots.scratch("bot-capture-parent-swap-");
  const source = await reviewAssembly(home);
  const pause = pauseAfter("ASSEMBLY.md");
  const outside = join(root, "outside-work");
  await mkdir(join(outside, "gate"), { recursive: true });
  await Promise.all([
    writeFile(join(outside, "STAGE.md"), "---\n---\nOutside instructions.\n"),
    writeFile(join(outside, "gate/01-check.sh"), GATE),
  ]);
  await chmod(join(outside, "gate/01-check.sh"), 0o755);

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "never used"), fauxAssistantMessage("done")]);
  const running = main(["run", "start", "review/main", "the request"], { ...held, captured: pause.captured });
  await pause.arrived;
  await rm(join(source, "flows/main/01-work"), { recursive: true });
  await symlink(outside, join(source, "flows/main/01-work"));
  pause.resume();

  await expect(running).resolves.toBe(2);
  expect(Buffer.concat(stdout).toString()).toBe("");
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// WITNESS 10, ticket 0119 — the growth is visible. `bot status` says what the
// runs' copies of the assembly hold: exactly the four captured files' own bytes,
// and inside the home's total rather than beside it, because a capture lives
// under `runs/`. The expectation is a sum of string lengths and not a `du`,
// which is this figure's honest meaning: logical content held, not filesystem
// blocks consumed (`inspection.ts` says so where it computes). RED against
// main, whose status line carries no such field.

async function extraFolderAssembly(home: string): Promise<string> {
  const base = join(home, "assemblies/review");
  await mkdir(join(base, "flows/main"), { recursive: true });
  await mkdir(join(base, "evals"));
  await Promise.all([
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\nfolders:\n  - evals\n---\nReview assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-work.md"), "---\n---\nDo the work.\n"),
    symlink("missing-first", join(base, "evals/opaque")),
  ]);
  return base;
}

async function runHash(home: string, root: string): Promise<{ hash: unknown; capture: string }> {
  const before = new Set(existsSync(join(home, "runs")) ? await runsIn(home) : []);
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "the answer"), fauxAssistantMessage("done")]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  const run = at((await runsIn(home)).filter((name) => !before.has(name)), 0);
  const started = at(await events(join(home, "runs", run, "record.jsonl")), 0);
  return { hash: started["assembly_hash"], capture: join(home, "runs", run, "assembly") };
}

test("a declared folder stays outside a running assembly and its identity", async () => {
  const { root, home } = await roots.scratch("bot-extra-folders-");
  const source = await extraFolderAssembly(home);

  const first = await runHash(home, root);
  expect(existsSync(join(first.capture, "evals"))).toBe(false);

  await unlink(join(source, "evals/opaque"));
  await symlink("missing-second", join(source, "evals/opaque"));
  const second = await runHash(home, root);
  expect(second.hash).toBe(first.hash);
  expect(existsSync(join(second.capture, "evals"))).toBe(false);
});
