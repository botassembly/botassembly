// Ticket 0029 items A6/A8 — the process driver: capture is byte-complete (the
// record must not lie about what a gate said), no kill timer leaks when
// terminate() lands twice, and process-group cleanup is re-runnable for groups
// tracked after a first activation.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createProcessGroups, runProcess, type DriverClock, type ProcessGroups } from "../src/process.ts";
import { waitFor } from "./hostile.ts";
import { manualClock } from "./manual-clock.ts";

const realClock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

/** A real-time clock that also tracks which timer handles are still pending. */
function trackingClock() {
  let id = 0;
  const pending = new Set<number>();
  const clock: DriverClock = {
    milliseconds: () => performance.now(),
    timestamp: () => new Date().toISOString(),
    setTimeout(callback, milliseconds) {
      id += 1;
      const handle = id;
      pending.add(handle);
      setTimeout(() => { if (pending.delete(handle)) callback(); }, milliseconds);
      return handle;
    },
    clearTimeout(handle) {
      if (typeof handle === "number") pending.delete(handle);
    },
  };
  return { clock, pending };
}

function countingClock() {
  const controlled = manualClock();
  let graceTimers = 0;
  const clock: DriverClock = {
    ...controlled,
    setTimeout(callback, milliseconds) {
      if (milliseconds === 250) graceTimers += 1;
      return controlled.setTimeout(callback, milliseconds);
    },
  };
  return {
    clock,
    advance: (milliseconds: number) => { controlled.advance(milliseconds); },
    graceTimers: () => graceTimers,
  };
}

const shell = { path: "/bin/sh", file: "sh", sha256: "0".repeat(64) };

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function killOwnedGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try { process.kill(-pid, "SIGKILL"); } catch { /* the process already ended */ }
}

const escapedPidMarker = "BOT_ESCAPED_PID=";
const escapedStartupBudgetMs = 2_000;
const quietDrainBudgetMs = 1_000;
const absoluteDrainBudgetMs = 5_000;

function escapedCapture(result: Awaited<ReturnType<typeof runProcess>>): { pid: number; payload: string } {
  const captured = result.output.toString("utf8");
  const newline = captured.indexOf("\n");
  const firstLine = newline === -1 ? captured : captured.slice(0, newline);
  const match = new RegExp(`^${escapedPidMarker}([0-9]+)$`).exec(firstLine);
  const pid = match === null ? Number.NaN : Number(match[1]);
  if (newline === -1 || !Number.isSafeInteger(pid) || pid <= 1) {
    const error = result.error === undefined ? null : {
      name: result.error.name,
      message: result.error.message,
      stack: result.error.stack,
    };
    throw new Error(`Escaped descendant did not publish a valid PID: captured=${JSON.stringify(captured)} exit=${JSON.stringify(result.exit)} timedOut=${JSON.stringify(result.timedOut)} aborted=${JSON.stringify(result.aborted)} overflowed=${JSON.stringify(result.overflowed)} captureIncomplete=${JSON.stringify(result.captureIncomplete)} error=${JSON.stringify(error)}`);
  }
  return { pid, payload: captured.slice(newline + 1) };
}

test("an invalid escaped PID reports every capture state", () => {
  const result: Awaited<ReturnType<typeof runProcess>> = {
    exit: null,
    output: Buffer.from("not-a-pid\npartial output\n"),
    timedOut: true,
    aborted: false,
    overflowed: true,
    captureIncomplete: true,
    error: new Error("helper failed"),
  };
  expect(() => escapedCapture(result)).toThrow(/overflowed=true captureIncomplete=true/);
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((settle) => { resolve = settle; });
  return { promise, resolve };
}

test("capture is byte-complete: output written after the shell exits (a lingering grandchild) is still read", async () => {
  const result = await runProcess({
    executable: shell,
    args: ["-c", "( sleep 0.2; echo late ) & echo early"],
    cwd: "/", env: {}, timeoutMs: 5_000, clock: realClock,
  });
  expect(result.exit).toBe(0);
  const text = result.output.toString("utf8");
  expect(text).toContain("early");
  expect(text).toContain("late");
});

test("an escaped descendant cannot keep a completed command's capture open", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-process-escaped-"));
  const script = join(root, "escape.cjs");
  await writeFile(script, [
    'const { spawn } = require("node:child_process");',
    'const child = spawn("/bin/sh", ["-c", "sleep 10"], { detached: true, stdio: ["ignore", process.stdout, process.stderr] });',
    `require("node:fs").writeSync(1, ${JSON.stringify(escapedPidMarker)} + String(child.pid) + "\\n");`,
    'child.unref();',
    'process.stdout.write("direct child exited\\n");',
  ].join("\n"));
  let escaped: number | undefined;
  try {
    const started = performance.now();
    const result = await runProcess({
      executable: { path: process.execPath }, args: [script], cwd: root, env: process.env,
      timeoutMs: escapedStartupBudgetMs, clock: realClock,
    });
    const capture = escapedCapture(result);
    escaped = capture.pid;
    expect(performance.now() - started).toBeLessThan(escapedStartupBudgetMs + quietDrainBudgetMs);
    expect(result).toMatchObject({ exit: 0, captureIncomplete: true });
    expect(capture.payload).toBe("direct child exited\n");
    expect(alive(escaped)).toBe(true);
  } finally {
    killOwnedGroup(escaped);
    await rm(root, { recursive: true, force: true });
  }
}, escapedStartupBudgetMs + quietDrainBudgetMs + 1_000);

test("continuous escaped output cannot extend capture past the absolute drain ceiling", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-process-absolute-drain-"));
  const script = join(root, "escape.cjs");
  await writeFile(script, [
    'const { spawn } = require("node:child_process");',
    'const child = spawn(process.execPath, ["-e", "setInterval(() => process.stdout.write(\'x\'), 100)"], { detached: true, stdio: ["ignore", process.stdout, process.stderr] });',
    `require("node:fs").writeSync(1, ${JSON.stringify(escapedPidMarker)} + String(child.pid) + "\\n");`,
    'child.unref();',
  ].join("\n"));
  let escaped: number | undefined;
  try {
    const started = performance.now();
    const result = await runProcess({
      executable: { path: process.execPath }, args: [script], cwd: root, env: process.env,
      timeoutMs: escapedStartupBudgetMs, clock: realClock,
    });
    const capture = escapedCapture(result);
    escaped = capture.pid;
    expect(performance.now() - started).toBeLessThan(escapedStartupBudgetMs + absoluteDrainBudgetMs);
    expect(result.captureIncomplete).toBe(true);
    expect(capture.payload.length).toBeGreaterThan(10);
  } finally {
    killOwnedGroup(escaped);
    await rm(root, { recursive: true, force: true });
  }
}, escapedStartupBudgetMs + absoluteDrainBudgetMs + 1_000);

test("a call without a shared controller settles its own process group", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-process-local-group-"));
  const script = join(root, "linger.cjs"), pidFile = join(root, "lingering.pid");
  await writeFile(script, [
    'const { spawn } = require("node:child_process");',
    'const { writeFileSync } = require("node:fs");',
    'const child = spawn("/bin/sh", ["-c", "sleep 10"], { stdio: "ignore" });',
    'writeFileSync(process.argv[2], String(child.pid));',
    'child.unref();',
  ].join("\n"));
  let lingering: number | undefined;
  try {
    const result = await runProcess({
      executable: { path: process.execPath }, args: [script, pidFile], cwd: root, env: process.env,
      timeoutMs: 5_000, clock: realClock,
    });
    lingering = Number(await readFile(pidFile, "utf8"));
    expect(result).toMatchObject({ exit: 0, captureIncomplete: false });
    await waitFor(() => !alive(lingering ?? -1));
  } finally {
    killOwnedGroup(lingering);
    await rm(root, { recursive: true, force: true });
  }
});

test("settling one shared process group leaves its sibling running", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-process-siblings-"));
  const lingeringScript = join(root, "linger.cjs"), lingeringPid = join(root, "lingering.pid"), siblingPid = join(root, "sibling.pid");
  await writeFile(lingeringScript, [
    'const { spawn } = require("node:child_process");',
    'const { writeFileSync } = require("node:fs");',
    'const child = spawn("/bin/sh", ["-c", "sleep 10"], { stdio: "ignore" });',
    'writeFileSync(process.argv[2], String(child.pid));',
    'child.unref();',
  ].join("\n"));
  const groups = createProcessGroups(realClock);
  const siblingAbort = new AbortController();
  const sibling = runProcess({
    executable: shell, args: ["-c", `echo $$ > '${siblingPid}'; sleep 10`], cwd: root, env: {},
    timeoutMs: 5_000, clock: realClock, groups, signal: siblingAbort.signal,
  });
  let firstChild: number | undefined, siblingGroup: number | undefined;
  try {
    await waitFor(async () => { try { siblingGroup = Number(await readFile(siblingPid, "utf8")); return true; } catch { return false; } });
    const first = await runProcess({
      executable: { path: process.execPath }, args: [lingeringScript, lingeringPid], cwd: root, env: process.env,
      timeoutMs: 5_000, clock: realClock, groups,
    });
    firstChild = Number(await readFile(lingeringPid, "utf8"));
    expect(first).toMatchObject({ exit: 0, captureIncomplete: false });
    expect(alive(siblingGroup ?? -1)).toBe(true);
    siblingAbort.abort();
    await expect(sibling).resolves.toMatchObject({ aborted: true });
  } finally {
    killOwnedGroup(firstChild);
    killOwnedGroup(siblingGroup);
    await groups.terminate();
    await rm(root, { recursive: true, force: true });
  }
});

test("spawn failure removes its durable reservation through the same settlement path", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-process-spawn-failure-"));
  const run = join(root, "run");
  try {
    const result = await runProcess({
      executable: { path: join(root, "does-not-exist") }, cwd: root, env: {},
      timeoutMs: 5_000, clock: realClock, groups: createProcessGroups(realClock, run),
    });
    expect(result).toMatchObject({ exit: null, captureIncomplete: false });
    expect(result.error).toBeInstanceOf(Error);
    expect(await readdir(join(run, "process-groups"))).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("command settlement and a root sweep share one TERM-to-KILL timer", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-process-race-"));
  const run = join(root, "run"), pidFile = join(root, "pid");
  const counted = countingClock();
  const groups = createProcessGroups(counted.clock, run);
  try {
    const running = runProcess({
      executable: shell, args: ["-c", `sleep 0.05; trap '' TERM; echo $$ > '${pidFile}'; sleep 10`], cwd: root, env: {},
      timeoutMs: 20, clock: counted.clock, groups,
    });
    await waitFor(async () => { try { await readFile(pidFile); return true; } catch { return false; } });
    counted.advance(20);
    const sweeping = groups.terminate();
    expect((await readdir(join(run, "process-groups"))).length).toBe(1);
    expect(counted.graceTimers()).toBe(1);
    counted.advance(250);
    await expect(running).resolves.toMatchObject({ timedOut: true, captureIncomplete: false });
    await sweeping;
    expect(counted.graceTimers()).toBe(1);
    expect(await readdir(join(run, "process-groups"))).toEqual([]);
  } finally {
    const cleanup = groups.terminate();
    counted.advance(250);
    await cleanup;
    await rm(root, { recursive: true, force: true });
  }
});

test("an evidence removal failure remains visible in the process result", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-process-evidence-failure-"));
  const run = join(root, "run"), started = join(root, "started");
  const groups = createProcessGroups(realClock, run);
  try {
    const running = runProcess({
      executable: shell, args: ["-c", `touch '${started}'; sleep 0.2`], cwd: root, env: {},
      timeoutMs: 5_000, clock: realClock, groups,
    });
    await waitFor(async () => { try { await readFile(started); return true; } catch { return false; } });
    const evidenceRoot = join(run, "process-groups");
    await waitFor(async () => (await readdir(evidenceRoot)).length === 1);
    const evidence = join(evidenceRoot, (await readdir(evidenceRoot))[0] ?? "missing");
    await unlink(evidence);
    await mkdir(evidence);
    const result = await running;
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error).toMatchObject({ code: "EISDIR" });
    expect((await readdir(evidenceRoot)).length).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a publication fault still waits for command settlement before returning", async () => {
  const release = deferred();
  const publication = new Error("publication failed");
  let settlementStarted = false;
  const groups: ProcessGroups = {
    reserve: () => Promise.resolve({}),
    track: () => undefined,
    publish: () => Promise.reject(publication),
    settle: () => { settlementStarted = true; return release.promise; },
    terminate: () => Promise.resolve(),
  };
  let returned = false;
  const running = runProcess({
    executable: shell, args: ["-c", "exit 0"], cwd: "/", env: {}, timeoutMs: 5_000, clock: realClock, groups,
  });
  void running.then(() => { returned = true; });
  await waitFor(() => settlementStarted);
  await new Promise((resolve) => { setImmediate(resolve); });
  expect(returned).toBe(false);
  release.resolve();
  const result = await running;
  expect(result.error).toBe(publication);
});

test("timeout and abort share one group settlement and leave no timer pending", async () => {
  const { clock, pending } = trackingClock();
  const controller = new AbortController();
  const running = runProcess({
    executable: shell,
    // Abort starts the settlement. Timeout reaches the same reservation before
    // its 250 ms grace ends. The pair must not create a second kill timer.
    args: ["-c", 'trap "" TERM; sleep 0.15'],
    cwd: "/", env: {}, timeoutMs: 30, clock,
    signal: controller.signal,
  });
  setTimeout(() => { controller.abort(); }, 5);
  const result = await running;
  expect(result.timedOut || result.aborted).toBe(true);
  expect([...pending]).toEqual([]);
});

test("process groups: terminate() is re-runnable for a group tracked after a first activation", async () => {
  const clock = manualClock();
  const groups = createProcessGroups(clock);
  const alive = (pid: number): boolean => {
    try { process.kill(pid, 0); return true; } catch { return false; }
  };
  const first = spawn("sleep", ["5"], { detached: true, stdio: "ignore" });
  if (first.pid === undefined) throw new Error("no pid");
  groups.track(first.pid);
  const firstTerminate = groups.terminate();
  await waitFor(() => !alive(first.pid ?? -1));
  clock.fire();
  await firstTerminate;
  const second = spawn("sleep", ["5"], { detached: true, stdio: "ignore" });
  if (second.pid === undefined) throw new Error("no pid");
  groups.track(second.pid);
  const secondTerminate = groups.terminate();
  try {
    await waitFor(() => !alive(second.pid ?? -1));
  } finally {
    if (alive(second.pid)) process.kill(-second.pid, "SIGKILL");
  }
  clock.fire();
  await secondTerminate;
});
