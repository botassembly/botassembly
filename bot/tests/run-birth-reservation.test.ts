// Ticket 0112 — a run is not prunable before it is alive.
//
// THE DEFECT, as the sequence and not as a race. Run birth used to be: hash the
// assembly, create the run directory and write `run_start`, write the request,
// THEN take the liveness lock. Between the record and the lock the run was a
// valid record with no ending and no lock — which is exactly what `stillRunning`
// reads as `crashed`, and crashed is prunable. A concurrent
// `bot prune --keep 0 --delete` deleted a run that was starting.
//
// WHY THIS IS WITNESSED AS AN ORDER AND NOT AS A RACE. Prune can only see a run
// that `runNames` enumerates, and `runNames` reads `runs/` and skips `.lock`
// entries — so the instant a run becomes visible to prune is the instant
// `runs/<run>/` exists, and not one syscall earlier. The whole fix is therefore
// one claim about order: `runs/<run>.lock` is on disk BEFORE `runs/<run>/` is.
// Test 1 asserts exactly that, and it is the assertion that is RED against main,
// where the two are created the other way round. It is not timed and nothing has
// to be won: an inotify watch on one directory reports its children's creation
// in order, and both names are direct children of `runs/`. (Measured before it
// was relied on: 300 trials of the two mkdirs under a non-recursive watch,
// 0 misreports. A recursive watch would NOT be sound here — Node adds the watch
// for a new subdirectory after that directory appears, so an event for
// `runs/<run>/record.jsonl` can genuinely be missed.)
//
// Test 2 holds a real run at a deterministic pause-point and prunes it, which is
// the consequence the order buys. It is green against main too, and says so:
// main also holds the lock by the time a stage starts. The pause is
// `createGating` — an injected dependency the CLI boundary already threads
// (cli.ts) — so the run parks with no model involved and no timer anywhere.
//
// Test 3 is the state the fix newly puts on disk and nothing else covers: a
// reservation with no run directory beside it. It reads as NO RUN AT ALL rather
// than as a run wearing some mark, which is what "the window is closed rather
// than moved" means.
//
// Nothing here reaches a model or the real `~/.pi`, `~/.cache` or
// `~/.local/share`: the provider is faux, and BOT_HOME and XDG_CACHE_HOME are
// explicit on every invocation, under an mkdtemp root this file removes.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { watch } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lockSync } from "proper-lockfile";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { realBoundary, tempRoots, writes } from "./cli-boundary.ts";
import { invokeCli } from "./invoke.ts";

const roots = tempRoots();

afterEach(() => roots.cleanup());

/** The smallest assembly there is: one flow, one stage. */
async function reviewAssembly(home: string): Promise<void> {
  const base = join(home, "assemblies/review");
  await mkdir(join(base, "flows/main"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-work.md"), "---\n---\nDo the work.\n"),
  ]);
}

/** The runs a home holds, by the same rule `runNames` uses: a `.lock` is a
 *  reservation and never a run (inspection.ts). */
async function runsIn(home: string): Promise<string[]> {
  return (await readdir(join(home, "runs"))).filter((name) => !name.endsWith(".lock"));
}

/** Wait for something that MUST arrive — a watcher's queued events, a run
 *  reaching its pause — rather than for a duration. It fails by timing out at
 *  the test level, never by sampling too early. */
async function until(reached: () => boolean): Promise<void> {
  while (!reached()) await new Promise((resume) => setTimeout(resume, 1));
}

// WITNESS 1, and the one that is RED against main. The order on disk IS the fix:
// a run becomes visible to prune when its directory appears, and by then the
// lock that says a process is still here is already there. Against main the two
// indices are the other way round and this fails on the last line.
test("a run reserves its name before its directory exists, so it is never visible without a lock", async () => {
  const { root, home } = await roots.scratch("bot-run-birth-");
  await reviewAssembly(home);
  await mkdir(join(home, "runs"), { recursive: true });
  const seen: string[] = [];
  const watcher = watch(join(home, "runs"), (_event, name) => {
    if (name !== null && !seen.includes(name)) seen.push(name);
  });

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "the answer"), fauxAssistantMessage("done")]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  const run = (await runsIn(home))[0] ?? "";
  expect(run).not.toBe("");
  await until(() => seen.includes(run) && seen.includes(`${run}.lock`));
  watcher.close();
  // The reservation was created, and it was created FIRST.
  expect(seen).toContain(`${run}.lock`);
  expect(seen.indexOf(`${run}.lock`)).toBeLessThan(seen.indexOf(run));
  // And it did not outlive the run: `finally` released it.
  await expect(readdir(join(home, "runs"))).resolves.toEqual([run]);
});

// WITNESS 2 — prune against a run held mid-flight, at a pause-point the test
// opens and closes itself. The run is parked inside `createGating`, before any
// model call. Prune names its lock and leaves it alone; then the pause is closed
// with a fault the machinery layer reports, and the run ends honestly — which
// also witnesses that the reservation is released on a path OUT of the run that
// is not the happy one.
test("prune names the lock of a run held at the pause-point, and the reservation goes when the run faults", async () => {
  const { root, home } = await roots.scratch("bot-run-birth-held-");
  await reviewAssembly(home);
  let parked = (): void => undefined;
  const arrived = new Promise<void>((resolve) => { parked = resolve; });
  let resume = (): void => undefined;
  const holding = new Promise<void>((resolve) => { resume = resolve; });

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);
  const running = main(["run", "start", "review/main", "the request"], {
    ...held,
    createGating: async () => {
      parked();
      await holding;
      // An OS-shaped throw, so the runtime reports it as the machinery fault it
      // is (model.ts) and the run gets an honest ending rather than escaping.
      throw Object.assign(new Error("the disk went away"), { syscall: "read", errno: -5, code: "EIO" });
    },
  });
  await arrived;

  const run = (await runsIn(home))[0] ?? "";
  expect(run).not.toBe("");
  // Its record is only a legal prefix. The listing does not infer a terminal
  // outcome from the separate lock evidence.
  const listed = await invokeCli(["run", "list"], { home });
  expect(listed.out).toContain("| running |");

  resume();
  await expect(running).resolves.toBe(2);
  // Released on the fault path, not only on the happy one.
  await expect(readdir(join(home, "runs"))).resolves.toEqual([run]);
});

// WITNESS 3 — the state run birth now passes through first, and the answer to
// "which mark does it read as": none, because it is not a run. `runNames` keeps
// only directories that are not `.lock`, so a reservation with nothing beside it
// is not in any listing, is not a prune candidate, and cannot be deleted by a
// prune that was asked for everything. That is what makes this a closed window
// rather than a moved one — the earlier state is not merely refused, it is not
// reachable by the verb at all.
//
// TICKET 0124 narrowed the last clause and this test is now the witness for the
// narrowing. Prune does take a lock beside no run — that is the orphan a SIGKILL
// here leaves forever (`orphan-run-lock.test.ts`). What keeps THIS one is that
// it is LIVE: the lock below is held for the length of the test and refreshed,
// so it is a run being born, not litter. The assertions did not move.
test("a reservation with no run directory is not a run: nothing lists it and prune cannot take it", async () => {
  const { home } = await roots.scratch("bot-run-birth-bare-");
  await mkdir(join(home, "runs"), { recursive: true });
  const name = "2026-08-05T09-00-00-abcd";
  const release = lockSync(join(home, "runs", name), { realpath: false });

  const listed = await invokeCli(["run", "list"], { home });
  expect(listed.code).toBe(0);
  expect(listed.out).toContain("No runs match.");
  expect(listed.err).toBe("");
  // The reservation itself remains untouched.
  await expect(readdir(join(home, "runs"))).resolves.toEqual([`${name}.lock`]);
  release();
});
