// Ticket 0063 item 2 — the signal GREEN leg. 0033 built the handled-signal
// path: a run that is signalled records the signal, ends with the signal's own
// exit code, and releases its lock on the way out. Every existing witness for
// it is a unit over `createRunSignal` or a hand-made lock; nothing had ever
// delivered a real signal to a real `bot run` and read what it left behind.
//
// The child is `signal-driver.ts`; see its header for why the process boundary
// is unavoidable here.
//
// ON FLAKE, because this is the class of test that has flaked all week (items
// 12, 15, 16, 17). Nothing in this file sleeps, and nothing races:
//
// - The child's provider stream NEVER settles, so the run parks in the agent's
//   first turn and stays there until it is signalled. There is no window to
//   hit — the state the test wants is a state the run cannot leave.
// - The marker is written from INSIDE that stream call. `turns.ts:45-47`
//   registers the abort listener and only then calls the provider, so a marker
//   on disk means the listener that the signal fires is already installed.
//   That is the whole ordering hazard, and it is closed by construction rather
//   than by waiting.
// - The parent polls for a CONDITION with a generous ceiling (`until`), it does
//   not wait a duration. The ceiling is CHILD_MS, nested inside the BOUNDARY_MS
//   this test is given — the nesting item 12 found inverted.
// - The lock is asserted HELD before the signal and GONE after, so "released"
//   is measured against an observed state rather than assumed.
//
// The assertion sources:
// - runtime.md, the lock: a run holds it for its life and releases it on every
//   path a handled signal takes.
// - record.md: the run's last line is its `run_end`, and a signalled run ends
//   with cause `signal`.
// - signal.ts: SIGTERM is signal 15 and exit 143 (128 + 15), the shell's own
//   convention, so the exit code the process leaves is the one a caller reads.
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { heldRecord } from "../src/record-lines.ts";
import { BOUNDARY_MS, CHILD_MS, cliPath, piped, spawned } from "./boundary.ts";
import { at, ensureTestInstallation, events, tempRoots } from "./cli-boundary.ts";

const { scratch, cleanup } = tempRoots();
afterEach(async () => { await cleanup(); });

const driver = fileURLToPath(new URL("./signal-driver.ts", import.meta.url));

/** Poll for a condition with a generous ceiling — not a wait for a duration.
 *  Fails naming what never became true, so a red says what it means. */
async function until(probe: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + CHILD_MS;
  while (Date.now() < deadline) {
    if (probe()) return;
    await new Promise((resume) => setTimeout(resume, 20));
  }
  throw new Error(`never became true within ${String(CHILD_MS)}ms: ${what}`);
}

async function assembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nA review assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nWork on the request.\n"),
  ]);
  ensureTestInstallation(home);
}

test("a SIGKILLed run either kills its hook child or keeps its worktree busy after its heartbeat goes stale", async () => {
  const { root, home } = await scratch("bot-cli-killed-child-");
  const stage = join(home, "assemblies/review/flows/main/01-work");
  const marker = join(root, "hook-started");
  const pidFile = join(root, "hook-pid");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nA review assembly.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nWork on the request.\n"),
    writeFile(join(stage, "before"), `#!/bin/sh\necho "$$" > '${pidFile}'\ntouch '${marker}'\nexec sleep 60\n`),
  ]);
  await chmod(join(stage, "before"), 0o755);
  ensureTestInstallation(home);
  const { child, ended } = spawned([driver], {
    ...process.env, BOT_HOME: home, XDG_CACHE_HOME: join(root, "cache"), PWD: root,
    BOT_SIGNAL_MARKER: marker, BOT_SIGNAL_CWD: root, BOT_SIGNAL_LOCK: join(root, "lock-after-main"),
  });
  let hookPid = 0;
  try {
    await until(() => existsSync(marker), "the hook child started");
    hookPid = Number((await readFile(pidFile, "utf8")).trim());
    expect(Number.isSafeInteger(hookPid) && hookPid > 0, "the hook records a usable process ID").toBe(true);
    const run = at((await readdir(join(home, "runs"))).filter((entry) => !entry.endsWith(".lock")), 0);
    child.kill("SIGKILL");
    expect((await ended).signal).toBe("SIGKILL");
    const stale = new Date(Date.now() - 60_000);
    await utimes(join(home, "runs", `${run}.lock`), stale, stale);
    const reading = await piped([cliPath, "home", "busy", root, "--quiet", "--home", home], { ...process.env, BOT_HOME: home });
    let childAlive = false;
    try { process.kill(hookPid, 0); childAlive = true; } catch { /* the run killed its child */ }
    if (childAlive) expect(reading).toEqual({ code: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
  } finally {
    if (hookPid !== 0) {
      try { process.kill(-hookPid, "SIGKILL"); } catch { /* the group already ended */ }
    }
    child.kill("SIGKILL");
    await ended;
  }
}, BOUNDARY_MS);

test("SIGTERM to a live run: the process leaves with the signal's exit code, the lock is released, and the record's last line is the signalled run_end", async () => {
  const { root, home } = await scratch("bot-cli-signal-");
  await assembly(home);
  const marker = join(root, "in-the-turn");
  const lockReport = join(root, "lock-after-main");

  const { child, ended } = spawned([driver], {
    ...process.env,
    BOT_HOME: home,
    XDG_CACHE_HOME: join(root, "cache"),
    PWD: root,
    BOT_SIGNAL_MARKER: marker,
    BOT_SIGNAL_CWD: root,
    BOT_SIGNAL_LOCK: lockReport,
  });

  // The child is inside the agent's first turn, which never ends by itself.
  await until(() => existsSync(marker), "the child reached the agent's first turn");

  // The run exists and is HOLDING its lock. Asserting this BEFORE the signal is
  // what makes the release below a measurement: proper-lockfile's default
  // sibling is `<run>.lock` beside the run directory (inspection.ts).
  const runs = join(home, "runs");
  const run = at((await readdir(runs)).filter((entry) => !entry.endsWith(".lock")), 0);
  const lock = join(runs, `${run}.lock`);
  expect(existsSync(lock), "the run holds its lock while it is working").toBe(true);

  child.kill("SIGTERM");
  const done = await ended;

  // The process left of its own accord, having HANDLED the signal — it was not
  // killed by it. `signal: null` is the half that says so: a child that ignored
  // SIGTERM would have been SIGKILLed by the CHILD_MS guard instead.
  expect({ code: done.code, signal: done.signal }).toEqual({ code: 143, signal: null });

  // The run named its cause on the way out, the way any unsuccessful run does
  // (runtime.md "Streams"): the person who signalled it is told what happened.
  expect(done.stderr.toString()).toBe("signal\n");

  // THE LOCK IS RELEASED, and released BY THE RUN. The child reports what it
  // saw from inside itself, after `main()` returned and before it exited,
  // because that is the only moment at which the two possible reasons for an
  // absent lock can be told apart: `proper-lockfile` also cleans up on process
  // exit, so the parent looking afterwards would find no lock either way.
  await expect(readFile(lockReport, "utf8")).resolves.toBe("released");

  // And nothing is left on disk for the next reader — a signalled run must not
  // read as live afterwards. This half distinguishes a handled signal from an
  // abrupt death: measured, a SIGKILLed run leaves its lock standing.
  expect(existsSync(lock), "no lock is left behind by a signalled run").toBe(false);

  // THE RECORD'S LAST LINE. A signalled run is a run that ENDED, so it ends the
  // way every run does — with a run_end — carrying the signal's cause and the
  // signal's exit code.
  const record = await events(join(runs, run, "record.jsonl"));
  expect(at(record, record.length - 1)).toMatchObject({ event: "run_end", exit: 143, cause: "signal" });

  // And the signal itself is on the record before it, named and numbered, so a
  // reader can tell a signalled run from one that merely exited 143.
  const signalled = record.filter((event) => event["event"] === "signal");
  expect(signalled).toEqual([expect.objectContaining({ name: "SIGTERM", signal: 15 })]);
  expect(record.indexOf(at(signalled, 0))).toBeLessThan(record.length - 1);
  const stageEnding = record.find((event) => event["event"] === "stage_end");
  expect(stageEnding).toMatchObject({ exit: 143, cause: "signal" });
  expect(await heldRecord(join(runs, run))).toMatchObject({ classification: "valid" });
}, BOUNDARY_MS);
