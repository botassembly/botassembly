// Ticket 0085 — `busy` reads live run records and their heartbeats. It does not
// publish a second, stage-scoped lock registry.
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { lockSync } from "proper-lockfile";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { BOUNDARY_MS, CHILD_MS, cliPath, piped, spawned } from "./boundary.ts";
import { currentRecord } from "./current-record.ts";
import { heldRecord } from "../src/record-lines.ts";
import { ensureTestInstallation, realBoundary, tempRoots } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(roots.cleanup);

async function assembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nWork.\n"),
  ]);
  ensureTestInstallation(home);
}

function busy(directory: string, home: string, defaultHome: string) {
  return piped([cliPath, "home", "busy", directory, "--quiet", "--home", home], { ...process.env, BOT_HOME: defaultHome });
}

async function answers(directory: string, home: string, defaultHome: string, code: 0 | 1): Promise<void> {
  await expect(busy(directory, home, defaultHome)).resolves.toMatchObject({
    code, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0),
  });
}

function start(run: string, workdir: string): Record<string, unknown> {
  return {
    record: 1, runtime: "0.0.1", ts: "2026-08-20T10:00:00.000Z", event: "run_start", run,
    assembly: "review", assembly_hash: "a".repeat(64), flow: "main",
    request: { path: "request.txt", sha256: "a".repeat(64), bytes: 3, via: "argument" }, workdir,
  };
}

function stageStart(stage: string, resolved: string): Record<string, unknown> {
  return {
    ts: "2026-08-20T10:00:01.000Z", event: "stage_start", stage, retry: 1,
    received: [], options: [], workdir: { authored: null, resolved }, session: "session.jsonl",
  };
}

function finishedStage(stage: string): Record<string, unknown>[] {
  return [
    { ts: "2026-08-20T10:00:01.100Z", event: "turn", stage, retry: 1, provider: "faux", model: "faux-1",
      input: 1, output: 1, cache_read: 0, cache_write: 0, total: 2, stop: "stop" },
    { ts: "2026-08-20T10:00:01.200Z", event: "check", stage, retry: 1, check: "output", exit: 0,
      capture: `stages/${stage}/1/1/checks/output.txt` },
    { ts: "2026-08-20T10:00:02.000Z", event: "stage_end", stage, retry: 1, exit: 0, cause: "success",
      output: { path: `stages/${stage}/1/1/output.txt`, sha256: "a".repeat(64) }, sealed: true, judged: true },
  ];
}

async function record(directory: string, events: Record<string, unknown>[]): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "record.jsonl"), currentRecord(events));
}

function pausedGating(parked: () => void, wait: Promise<void>) {
  return async () => {
    parked();
    await wait;
    throw Object.assign(new Error("the disk went away"), { syscall: "read", errno: -5, code: "EIO" });
  };
}

// A run outside BOT_HOME's default must answer from the --home it was given,
// and liveness must not require a writable holder directory.
test("busy uses the named home for a live run and creates no holder registry", async () => {
  const { root, home } = await roots.scratch("bot-busy-live-");
  const workdir = join(root, "worktree");
  const defaultHome = join(root, "default-home");
  await Promise.all([assembly(home), mkdir(workdir)]);
  let arrived = (): void => undefined;
  const atStage = new Promise<void>((resolve) => { arrived = resolve; });
  let resume = (): void => undefined;
  const wait = new Promise<void>((resolve) => { resume = resolve; });
  const { held: boundary } = realBoundary(root, home, [], []);
  const running = main(["run", "start", "review/main", "--in", workdir, "the request"], {
    ...boundary, createGating: pausedGating(arrived, wait),
  });
  await atStage;

  try {
    await answers(workdir, home, defaultHome, 0);
    expect(existsSync(join(home, "worktrees"))).toBe(false);
  } finally {
    resume();
    await running;
  }
}, BOUNDARY_MS);

// The top-level run owns its root for its whole heartbeat, while active stage
// overrides and nested child runs own their resolved directories. A missing or
// stale record cannot establish ownership; an unreadable live record is instead
// a conservative busy answer, because it cannot prove any directory idle.
test("busy derives live directories from run records and heartbeats", async () => {
  const { root, home } = await roots.scratch("bot-busy-record-");
  const elsewhere = join(root, "default-home");
  const runRoot = join(root, "worktree");
  const finished = join(runRoot, "finished");
  const branch = join(runRoot, "parallel-branch");
  const child = join(runRoot, "child");
  const missing = join(root, "missing-record");
  const unreadable = join(root, "unreadable-record");
  const uncertain = join(root, "uncertain-directory");
  const parent = "2026-08-20T10-00-00-parent";
  const childRun = "1";
  const missingRun = "2026-08-20T10-00-01-missing";
  const unreadableRun = "2026-08-20T10-00-02-unreadable";
  const parentDirectory = join(home, "runs", parent);
  const childDirectory = join(parentDirectory, "stages/02-parallel/branch/1/1/subflows", childRun);
  const missingDirectory = join(home, "runs", missingRun);
  const unreadableDirectory = join(home, "runs", unreadableRun);
  await Promise.all([runRoot, finished, branch, child, missing, unreadable, uncertain].map((path) => mkdir(path, { recursive: true })));
  await record(parentDirectory, [
    start(parent, runRoot), stageStart("01-finished", "finished"), ...finishedStage("01-finished"),
    stageStart("02-parallel/branch", "parallel-branch"),
  ]);
  await record(childDirectory, [start(childRun, runRoot), stageStart("01-child", "child")]);
  await mkdir(missingDirectory, { recursive: true });
  await record(unreadableDirectory, []);
  await writeFile(join(unreadableDirectory, "record.jsonl"), Buffer.from([0xff]));
  const releaseParent = lockSync(parentDirectory, { realpath: false });
  const releaseChild = lockSync(childDirectory, { realpath: false });
  const releaseMissing = lockSync(missingDirectory, { realpath: false });
  const releaseUnreadable = lockSync(unreadableDirectory, { realpath: false });
  let parentHeld = true;
  let childHeld = true;
  let unreadableHeld = true;

  try {
    // An unreadable record cannot tell the probe what it holds, so its live
    // heartbeat makes even another directory unsafe to delete.
    await answers(uncertain, home, elsewhere, 0);
    releaseUnreadable();
    unreadableHeld = false;

    await Promise.all([runRoot, branch, child].map(async (directory) => answers(directory, home, elsewhere, 0)));
    await Promise.all([finished, missing].map(async (directory) => answers(directory, home, elsewhere, 1)));

    // The child remains its own live run after its parent has gone stale.
    releaseParent();
    parentHeld = false;
    await mkdir(`${parentDirectory}.lock`);
    const stale = new Date(Date.now() - 60_000);
    await utimes(`${parentDirectory}.lock`, stale, stale);
    await answers(child, home, elsewhere, 0);

    releaseChild();
    childHeld = false;
    await mkdir(`${childDirectory}.lock`);
    await utimes(`${childDirectory}.lock`, stale, stale);
    await answers(child, home, elsewhere, 1);
  } finally {
    if (parentHeld && existsSync(`${parentDirectory}.lock`)) releaseParent();
    if (childHeld && existsSync(`${childDirectory}.lock`)) releaseChild();
    if (existsSync(`${missingDirectory}.lock`)) releaseMissing();
    if (unreadableHeld && existsSync(`${unreadableDirectory}.lock`)) releaseUnreadable();
  }
}, BOUNDARY_MS);

// A malformed child tree is not proof that there are no live children. Its
// range cannot be bounded, so the safe answer stays busy even outside the
// parent's recorded root.
test("busy fails closed when a live run's child tree cannot be traversed", async () => {
  const { root, home } = await roots.scratch("bot-busy-child-tree-");
  const workdir = join(root, "worktree");
  const uncertain = join(root, "uncertain-directory");
  const run = "2026-08-20T10-00-00-parent";
  const directory = join(home, "runs", run);
  await Promise.all([mkdir(workdir), mkdir(uncertain)]);
  await record(directory, [start(run, workdir)]);
  // A directory walk reaches this name before it can discover any nested
  // subflow run. `readdir(stages)` therefore fails with ENOTDIR.
  await writeFile(join(directory, "stages"), "not a child tree\n");
  const release = lockSync(directory, { realpath: false });

  try {
    await answers(uncertain, home, join(root, "default-home"), 0);
  } finally {
    if (existsSync(`${directory}.lock`)) release();
  }
}, BOUNDARY_MS);

test("busy treats every malformed live workdir as unknown ownership", async () => {
  const { root, home } = await roots.scratch("bot-busy-workdir-shape-");
  const run = "2026-08-20T10-00-00-workdir";
  const directory = join(home, "runs", run);
  const runRoot = join(root, "worktree");
  const uncertain = join(root, "uncertain");
  await Promise.all([mkdir(runRoot), mkdir(uncertain)]);
  await record(directory, [start(run, runRoot)]);
  const release = lockSync(directory, { realpath: false });
  try {
    for (const resolved of ["", "..", "nested/../sibling", "nested//sibling", "nested\\sibling", join(root, "outside")]) {
      await record(directory, [start(run, runRoot), stageStart("01-work", resolved)]);
      await answers(uncertain, home, join(root, "default-home"), 0);
    }
    await record(directory, [start(run, "relative-root")]);
    await answers(uncertain, home, join(root, "default-home"), 0);
  } finally {
    if (existsSync(`${directory}.lock`)) release();
  }
}, BOUNDARY_MS);

test("a live root stage owns the run root and no unrelated directory", async () => {
  const { root, home } = await roots.scratch("bot-busy-root-workdir-");
  const run = "2026-08-20T10-00-00-root";
  const directory = join(home, "runs", run);
  const runRoot = join(root, "worktree");
  const unrelated = join(root, "unrelated");
  await Promise.all([mkdir(runRoot), mkdir(unrelated)]);
  await record(directory, [start(run, runRoot), stageStart("01-work", ".")]);
  const release = lockSync(directory, { realpath: false });
  try {
    await answers(runRoot, home, join(root, "default-home"), 0);
    await answers(unrelated, home, join(root, "default-home"), 1);
  } finally {
    if (existsSync(`${directory}.lock`)) release();
  }
}, BOUNDARY_MS);

// Ticket 0068's run-lock guarantee remains after 0085 deletes the unrelated
// stage-holder compromise path.
const driver = fileURLToPath(new URL("./signal-driver.ts", import.meta.url));
async function until(probe: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + CHILD_MS;
  while (Date.now() < deadline) {
    if (probe()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`never became true within ${String(CHILD_MS)}ms: ${what}`);
}

test("a compromised run lock ends the record cleanly", async () => {
  const { root, home } = await roots.scratch("bot-run-lock-compromised-");
  await assembly(home);
  const marker = join(root, "in-the-turn");
  const report = join(root, "lock-after-main");
  const { child, ended } = spawned([driver], {
    ...process.env, BOT_HOME: home, XDG_CACHE_HOME: join(root, "cache"), PWD: root,
    BOT_SIGNAL_MARKER: marker, BOT_SIGNAL_CWD: root, BOT_SIGNAL_LOCK: report,
  });
  try {
    await until(() => existsSync(marker), "the child reached its live stage");
    const run = (await readdir(join(home, "runs"))).find((name) => !name.endsWith(".lock"));
    if (run === undefined) throw new Error("the live run was not recorded");
    await rm(join(home, "runs", `${run}.lock`), { recursive: true });
    const done = await ended;

    expect({ code: done.code, signal: done.signal }).toEqual({ code: 2, signal: null });
    const record = (await readFile(join(home, "runs", run, "record.jsonl"), "utf8")).trimEnd()
      .split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    const end = record.at(-1);
    expect(record.filter((event) => event["event"] === "signal")).toEqual([]);
    expect(record.find((event) => event["event"] === "stage_end")).toMatchObject({ exit: 2, cause: "fault" });
    expect(end).toMatchObject({ event: "run_end", exit: 2, cause: "fault" });
    expect(String(end?.["reason"])).toMatch(/run.*lock.*compromised/iu);
    expect(await heldRecord(join(home, "runs", run))).toMatchObject({ classification: "valid" });
    expect(done.stderr.toString()).toMatch(/fault:.*run.*lock.*compromised/iu);
    await expect(readFile(report, "utf8")).resolves.toBe("released");
  } finally {
    child.kill("SIGTERM");
    await ended;
  }
}, BOUNDARY_MS);

// Ticket 0143's production mechanism: a starved holder misses the ten-second
// heartbeat window, then another caller legitimately reclaims that stale lock.
// The earlier deletion case stays above because ticket 0068 separately pins it.
test("an event-loop stall records which run lock was compromised and for how long", async () => {
  const { root, home } = await roots.scratch("bot-run-lock-stall-");
  await assembly(home);
  const marker = join(root, "in-the-turn");
  const report = join(root, "lock-after-main");
  const environment = {
    ...process.env, BOT_HOME: home, XDG_CACHE_HOME: join(root, "cache"), PWD: root,
    BOT_SIGNAL_MARKER: marker, BOT_SIGNAL_CWD: root, BOT_SIGNAL_LOCK: report,
    BOT_SIGNAL_STALL_MS: "13000",
  };
  const { child, ended } = spawned([driver], environment);
  let releaseReclaimed = (): void => undefined;
  try {
    await until(() => existsSync(marker), "the child reached its stalled stage");
    const run = (await readdir(join(home, "runs"))).find((name) => !name.endsWith(".lock"));
    if (run === undefined) throw new Error("the stalled run was not recorded");
    const directory = join(home, "runs", run);
    const lock = `${directory}.lock`;
    await until(() => statSync(lock).mtimeMs < Date.now() - 10_000, "the stalled run lock became stale");
    releaseReclaimed = lockSync(directory, { realpath: false, stale: 10_000 });

    const done = await ended;
    expect({ code: done.code, signal: done.signal }).toEqual({ code: 2, signal: null });
    expect(done.stderr.toString()).not.toContain("driver threw");
    // This process still owns the replacement lock, so the driver's ordinary
    // release probe reads held; a clean process exit is the relevant boundary.
    await expect(readFile(report, "utf8")).resolves.toBe("held");

    const raw = (await readFile(join(directory, "record.jsonl"), "utf8")).trimEnd().split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(raw.filter((event) => event["event"] === "signal")).toEqual([]);
    expect(raw.find((event) => event["event"] === "stage_end")).toMatchObject({ exit: 2, cause: "fault" });
    expect(raw.at(-1)).toMatchObject({ event: "run_end", exit: 2, cause: "fault" });
    expect(String(raw.at(-1)?.["reason"])).toMatch(/run lock.*compromised/iu);
    expect(await heldRecord(directory)).toMatchObject({ classification: "valid" });

    const shown = await piped([cliPath, "run", "events", run, "--home", home], environment);
    expect(shown.code, shown.stderr.toString()).toBe(0);
    const diagnostic = shown.stdout.toString().split("\n")
      .find((line) => line.includes("  run_end  ") && line.includes("lock")) ?? "";
    expect(diagnostic).toContain(run);
    expect(diagnostic).toMatch(/run lock.*compromised/iu);
    const duration = /(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|s)\b/iu.exec(diagnostic);
    expect(duration, "the recorded diagnostic does not name the stall duration").not.toBeNull();
    const amount = Number(duration?.[1]);
    const milliseconds = duration?.[2]?.toLowerCase().startsWith("m") === true ? amount : amount * 1000;
    expect(milliseconds).toBeGreaterThanOrEqual(10_000);
  } finally {
    releaseReclaimed();
    child.kill("SIGTERM");
    await ended;
  }
}, BOUNDARY_MS);
