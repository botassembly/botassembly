import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess, spawn } from "node:child_process";
import { afterEach, expect, test } from "vitest";
import { runSearchCommand, type RunSearchDependencies } from "../src/run-search-command.ts";
import type { DriverClock } from "../src/process.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(async (root) => { await rm(root, { recursive: true, force: true }); })); });

class FakeClock implements DriverClock {
  now = 0;
  next = 0;
  timers = new Map<number, { due: number; callback: () => void }>();
  milliseconds(): number { return this.now; }
  timestamp(): string { return "2026-01-01T00:00:00.000Z"; }
  setTimeout(callback: () => void, milliseconds: number): number { const id = ++this.next; this.timers.set(id, { due: this.now + milliseconds, callback }); return id; }
  clearTimeout(handle: unknown): void { if (typeof handle === "number") this.timers.delete(handle); }
  advance(milliseconds: number): void {
    const target = this.now + milliseconds;
    let due = [...this.timers].filter(([, timer]) => timer.due <= target).sort((left, right) => left[1].due - right[1].due)[0];
    while (due !== undefined) {
      this.now = due[1].due; this.timers.delete(due[0]); due[1].callback();
      due = [...this.timers].filter(([, timer]) => timer.due <= target).sort((left, right) => left[1].due - right[1].due)[0];
    }
    this.now = target;
  }
}

class FakeChild extends EventEmitter {
  pid: number | undefined = 987_654;
  stdout = new PassThrough();
  stderr = new PassThrough();
  finish(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.stdout.end(); this.stderr.end();
    queueMicrotask(() => { this.emit("exit", code, signal); this.emit("close", code, signal); });
  }
  directClose(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.emit("exit", code, signal); this.emit("close", code, signal);
  }
}

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-search-life-")); roots.push(root);
  const held = join(root, "home"); await mkdir(join(held, "runs", "one"), { recursive: true });
  await writeFile(join(held, "runs", "one", "record.jsonl"), "needle\n"); return held;
}

function rg(path = "one/record.jsonl", line = 1, text = "needle\n"): string {
  return `${JSON.stringify({ type: "match", data: { path: { text: path }, lines: { text }, line_number: line } })}\n`;
}

async function harness(search: (child: FakeChild, clock: FakeClock, abort: AbortController) => void, group?: (signal: NodeJS.Signals | 0, child: FakeChild) => { exists: boolean; error?: Error }) {
  const held = await home(), clock = new FakeClock(), abort = new AbortController(), calls: Array<{ name: string; args: string[]; options: Record<string, unknown> }> = [], signals: Array<NodeJS.Signals | 0> = [];
  let searchChild: FakeChild | undefined;
  const spawnChild = ((name: string, args: string[], options: Record<string, unknown>) => {
    calls.push({ name, args, options }); const child = new FakeChild();
    if (args[0] === "--version") queueMicrotask(() => { child.stdout.write("ripgrep 14\n"); child.finish(0); });
    else { searchChild = child; queueMicrotask(() => { search(child, clock, abort); }); }
    return child as unknown as ChildProcess;
  }) as unknown as typeof spawn;
  const dependencies = { spawn: spawnChild, signalGroup: (_pid: number, signal: NodeJS.Signals | 0) => { signals.push(signal); return group?.(signal, searchChild ?? new FakeChild()) ?? { exists: false }; } } as RunSearchDependencies;
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  const promise = runSearchCommand(["--json", "--limit", "1", "--home", held, "--", "needle"], { cwd: held, env: { PATH: "/tools", EXTRA: "secret" }, stdout: (bytes) => { stdout.push(Buffer.from(bytes)); }, stderr: (bytes) => { stderr.push(Buffer.from(bytes)); }, signal: abort.signal, clock }, dependencies);
  return { promise, clock, abort, calls, signals, stdout, stderr, get child() { return searchChild; } };
}

async function flush(): Promise<void> { await new Promise<void>((resolve) => { setImmediate(resolve); }); }
async function started(run: { calls: unknown[] }, count = 2): Promise<void> { while (run.calls.length < count) await flush(); await flush(); }
async function result(promise: Promise<number>, label: string): Promise<number> { return await Promise.race([promise, new Promise<number>((_resolve, reject) => { setTimeout(() => { reject(new Error(`${label} did not settle`)); }, 100); })]); }

test("uses exact minimal probe and search invocations and accepts natural/no-match exits", async () => {
  for (const code of [0, 1]) {
    const run = await harness((child) => { if (code === 0) child.stdout.write(rg()); child.finish(code); });
    expect(await run.promise).toBe(0);
    expect(run.calls[0]).toMatchObject({ name: "rg", args: ["--version"], options: { detached: true, env: { PATH: "/tools", LANG: "C", LC_ALL: "C" }, stdio: ["ignore", "pipe", "pipe"] } });
    expect(typeof run.calls[0]?.options["cwd"]).toBe("string");
    expect(run.calls[1]?.args).toEqual(["--threads", "1", "--fixed-strings", "--json", "--no-config", "--text", "--with-filename", "--line-number", "--", "needle", "one/record.jsonl"]);
  }
});

test("kills a surviving process group after direct child close and descendant-held pipes", async () => {
  let alive = true;
  const run = await harness((child, _clock, abort) => { abort.abort(); child.directClose(null, "SIGTERM"); }, (signal) => {
    if (signal === "SIGKILL" && alive) { alive = false; return { exists: true }; }
    return { exists: alive };
  });
  await started(run); run.clock.advance(250); await flush();
  expect(run.signals).toEqual(["SIGTERM", "SIGKILL"]);
  run.clock.advance(1_000); expect(await run.promise).toBe(4);
  expect(JSON.parse(Buffer.concat(run.stderr).toString())).toMatchObject({ error: { cause: "dependency-failed" } });
});

test("disposes each descendant-held pipe for in-group and escaped descendants", async () => {
  for (const held of ["stdout", "stderr"] as const) for (const escaped of [false, true]) {
    let alive = !escaped;
    const run = await harness((child, _clock, abort) => {
      abort.abort(); if (held === "stdout") child.stderr.end(); else child.stdout.end(); child.directClose(null, "SIGTERM");
    }, (signal) => {
      if (signal === "SIGKILL" && alive) { alive = false; return { exists: true }; }
      return { exists: alive };
    });
    await started(run); run.clock.advance(250); await flush(); if (!escaped) run.clock.advance(1_000);
    expect(await result(run.promise, `${held}/${String(escaped)}`)).toBe(4);
    expect(run.signals).toEqual(escaped ? ["SIGTERM", "SIGKILL"] : ["SIGTERM", "SIGKILL", "SIGKILL"]);
  }
});

test("maps timeout, page stop, stream error, signal error, and cleanup timeout exactly", async () => {
  const timeout = await harness(() => undefined); await started(timeout); timeout.clock.advance(10_250); await flush(); timeout.clock.advance(1_000);
  expect(await result(timeout.promise, "timeout")).toBe(4); expect(JSON.parse(Buffer.concat(timeout.stderr).toString())).toMatchObject({ error: { cause: "close-failed" } });

  const page = await harness((child) => { child.stdout.write(rg()); child.stdout.write(rg("one/record.jsonl", 2)); child.directClose(null, "SIGTERM"); });
  await started(page); page.clock.advance(250); expect(await result(page.promise, "page")).toBe(0); expect(page.signals).toEqual(["SIGTERM", "SIGKILL"]);

  const pipe = await harness((child) => { child.stdout.emit("error", new Error("pipe")); child.directClose(null, "SIGTERM"); });
  await started(pipe); pipe.clock.advance(250); expect(await result(pipe.promise, "pipe")).toBe(4); expect(JSON.parse(Buffer.concat(pipe.stderr).toString())).toMatchObject({ error: { cause: "dependency-failed" } });

  const signal = await harness((child, _clock, abort) => { abort.abort(); child.directClose(null, "SIGTERM"); }, (value) => value === "SIGTERM" ? { exists: true, error: new Error("EPERM") } : { exists: false });
  await started(signal); signal.clock.advance(250); expect(await result(signal.promise, "signal")).toBe(4); expect(JSON.parse(Buffer.concat(signal.stderr).toString())).toMatchObject({ error: { cause: "close-failed", message: "The search tool process group could not be signaled." } });

  const stuck = await harness((child, _clock, abort) => { abort.abort(); child.directClose(null, "SIGTERM"); }, () => ({ exists: true }));
  await started(stuck); stuck.clock.advance(1_250); expect(await result(stuck.promise, "stuck")).toBe(4); expect(JSON.parse(Buffer.concat(stuck.stderr).toString())).toMatchObject({ error: { cause: "close-failed" } });
});

test("preserves clean timeout and abort outcomes after bounded settlement", async () => {
  const timeout = await harness(() => undefined); await started(timeout); timeout.clock.advance(10_000);
  timeout.child?.finish(null, "SIGTERM"); await flush(); timeout.clock.advance(250);
  expect(await timeout.promise).toBe(4); expect(JSON.parse(Buffer.concat(timeout.stderr).toString())).toMatchObject({ error: { cause: "timeout" } });

  const aborted = await harness((child, _clock, abort) => { abort.abort(); child.finish(null, "SIGTERM"); });
  await started(aborted); aborted.clock.advance(250);
  expect(await aborted.promise).toBe(4); expect(JSON.parse(Buffer.concat(aborted.stderr).toString())).toMatchObject({ error: { cause: "dependency-failed" } });
});

test("ignores termination-time stream bytes after page stop while settling direct close", async () => {
  const run = await harness((child) => {
    child.stdout.write(rg()); child.stdout.write(rg("one/record.jsonl", 2));
    child.stderr.write("termination diagnostic after page stop\n"); child.directClose(null, "SIGTERM");
  });
  await started(run); run.clock.advance(250);
  expect(await result(run.promise, "page/direct close")).toBe(0); expect(run.signals).toEqual(["SIGTERM", "SIGKILL"]);
});

test("settles a page stop without a signal-zero process-group probe", async () => {
  let kills = 0;
  const run = await harness((child) => {
    child.stdout.write(rg()); child.stdout.write(rg("one/record.jsonl", 2)); child.directClose(null, "SIGTERM");
  }, (signal) => {
    if (signal === 0) return { exists: true, error: new Error("Darwin signal-zero failure") };
    if (signal === "SIGKILL") return { exists: ++kills === 1 };
    return { exists: true };
  });
  await started(run); run.clock.advance(250); await flush(); run.clock.advance(1_000);
  expect(await result(run.promise, "page/kill settlement")).toBe(0);
  expect(run.signals).toEqual(["SIGTERM", "SIGKILL", "SIGKILL"]);
});

test("reports process-group kill errors during grace and cleanup", async () => {
  for (const failedAt of [1, 2]) {
    let kills = 0;
    const run = await harness((child) => {
      child.stdout.write(rg()); child.stdout.write(rg("one/record.jsonl", 2)); child.directClose(null, "SIGTERM");
    }, (signal) => {
      if (signal !== "SIGKILL") return { exists: true };
      kills += 1; if (kills === failedAt) return { exists: true, error: new Error("signal failure") };
      return { exists: failedAt === 2 };
    });
    await started(run); run.clock.advance(250); await flush(); run.clock.advance(1_000);
    expect(await result(run.promise, `signal failure ${String(failedAt)}`)).toBe(4);
    expect(JSON.parse(Buffer.concat(run.stderr).toString())).toMatchObject({ error: { cause: "close-failed", message: "The search tool process group could not be signaled." } });
    expect(run.signals).toEqual(["SIGTERM", "SIGKILL", "SIGKILL"]);
  }
});

test("maps synchronous spawn failure without falling through to search", async () => {
  const held = await home(), stderr: Buffer[] = [], clock = new FakeClock();
  const spawnChild = (() => { const problem = new Error("missing") as NodeJS.ErrnoException; problem.code = "EACCES"; throw problem; }) as unknown as typeof spawn;
  const exit = await runSearchCommand(["--json", "--home", held, "--", "needle"], { cwd: held, env: { PATH: "/tools" }, stdout: () => undefined, stderr: (bytes) => { stderr.push(Buffer.from(bytes)); }, clock }, { spawn: spawnChild });
  expect(exit).toBe(4); expect(JSON.parse(Buffer.concat(stderr).toString())).toMatchObject({ error: { cause: "dependency-failed" } });

  const asyncClock = new FakeClock(), asyncErrors: Buffer[] = [];
  const asyncSpawn = (() => { const child = new FakeChild(); child.pid = undefined; queueMicrotask(() => { const problem = new Error("missing") as NodeJS.ErrnoException; problem.code = "ENOENT"; child.emit("error", problem); }); return child as unknown as ChildProcess; }) as unknown as typeof spawn;
  const asyncExit = await runSearchCommand(["--json", "--home", held, "--", "needle"], { cwd: held, env: { PATH: "/tools" }, stdout: () => undefined, stderr: (bytes) => { asyncErrors.push(Buffer.from(bytes)); }, clock: asyncClock }, { spawn: asyncSpawn });
  expect(asyncExit).toBe(4); expect(asyncClock.timers.size).toBe(0); expect(JSON.parse(Buffer.concat(asyncErrors).toString())).toMatchObject({ error: { cause: "dependency-failed" } });
});

test("rejects exit-close mismatch and missing lifecycle events within a bound", async () => {
  const mismatch = await harness((child) => { child.stdout.end(); child.stderr.end(); child.emit("exit", 0, null); child.emit("close", 1, null); });
  expect(await mismatch.promise).toBe(4); expect(JSON.parse(Buffer.concat(mismatch.stderr).toString())).toMatchObject({ error: { cause: "close-failed" } });
  for (const event of ["exit", "close"] as const) {
    const missing = await harness((child) => { child.stdout.end(); child.stderr.end(); child.emit(event, 0, null); });
    await started(missing); missing.clock.advance(11_250); expect(await missing.promise).toBe(4);
    expect(JSON.parse(Buffer.concat(missing.stderr).toString())).toMatchObject({ error: { cause: "close-failed" } });
  }
});

test("stops a version probe at 4,096 bytes and carries abort into probing", async () => {
  const held = await home(), clock = new FakeClock(), abort = new AbortController(), signals: Array<NodeJS.Signals | 0> = [], stderr: Buffer[] = [];
  const spawnChild = (() => { const child = new FakeChild(); queueMicrotask(() => { child.stdout.write(Buffer.alloc(4_097, 120)); child.directClose(null, "SIGTERM"); }); return child as unknown as ChildProcess; }) as unknown as typeof spawn;
  const promise = runSearchCommand(["--json", "--home", held, "--", "needle"], { cwd: held, env: { PATH: "/tools" }, stdout: () => undefined, stderr: (bytes) => { stderr.push(Buffer.from(bytes)); }, signal: abort.signal, clock }, { spawn: spawnChild, signalGroup: (_pid, signal) => { signals.push(signal); return { exists: false }; } });
  while (signals.length === 0) await flush(); clock.advance(250); expect(await promise).toBe(4); expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
  expect(JSON.parse(Buffer.concat(stderr).toString())).toMatchObject({ error: { cause: "result-too-large" } });

  const pre = new AbortController(); pre.abort(); const aborted: Array<NodeJS.Signals | 0> = [];
  const second = runSearchCommand(["--json", "--home", held, "--", "needle"], { cwd: held, env: { PATH: "/tools" }, stdout: () => undefined, stderr: () => undefined, signal: pre.signal, clock }, { spawn: spawnChild, signalGroup: (_pid, signal) => { aborted.push(signal); return { exists: false }; } });
  while (aborted.length === 0) await flush(); clock.advance(250); expect(await second).toBe(4); expect(aborted[0]).toBe("SIGTERM");
});

test("stops search at the 16 MiB combined stream bound", async () => {
  const run = await harness((child) => { child.stdout.write(Buffer.alloc(16 * 1024 * 1024)); child.stderr.write("x"); child.finish(0); });
  await started(run); run.clock.advance(250); expect(await run.promise).toBe(4); expect(run.stdout).toHaveLength(0);
  expect(JSON.parse(Buffer.concat(run.stderr).toString())).toMatchObject({ error: { cause: "result-too-large" } });
});

test("preserves close-failed when a version probe misses exit, close, or pipe settlement", async () => {
  for (const missing of ["exit", "close", "pipe"] as const) {
    const held = await home(), clock = new FakeClock(), stderr: Buffer[] = [], calls: unknown[] = [];
    const spawnChild = (() => {
      calls.push(true); const child = new FakeChild(); child.stdout.write("ripgrep 14\n");
      queueMicrotask(() => {
        if (missing !== "pipe") { child.stdout.end(); child.stderr.end(); }
        else { child.stdout.destroy = () => child.stdout; child.stderr.destroy = () => child.stderr; }
        if (missing !== "exit") child.emit("exit", 0, null);
        if (missing !== "close") child.emit("close", 0, null);
      });
      return child as unknown as ChildProcess;
    }) as unknown as typeof spawn;
    const promise = runSearchCommand(["--json", "--home", held, "--", "needle"], { cwd: held, env: { PATH: "/tools" }, stdout: () => undefined, stderr: (bytes) => { stderr.push(Buffer.from(bytes)); }, clock }, { spawn: spawnChild, signalGroup: () => ({ exists: false }) });
    await started({ calls }, 1); clock.advance(11_250);
    expect(await result(promise, `probe/${missing}`)).toBe(4); expect(JSON.parse(Buffer.concat(stderr).toString())).toMatchObject({ error: { cause: "close-failed" } });
  }
});

test("distinguishes protocol corruption from actual protocol size overflow", async () => {
  for (const [line, cause] of [[`${JSON.stringify({ type: "diagnostic", data: {} })}\n`, "dependency-failed"], [`${JSON.stringify({ type: "match", data: { path: { text: "one/record.jsonl" }, lines: { text: "needle" }, line_number: 0 } })}\n`, "dependency-failed"], [`${"x".repeat(1_048_577)}\n`, "result-too-large"]] as const) {
    const run = await harness((child) => { child.stdout.write(line); child.finish(0); });
    await started(run); run.clock.advance(250); expect(await run.promise).toBe(4);
    expect(JSON.parse(Buffer.concat(run.stderr).toString())).toMatchObject({ error: { cause } });
  }
});

test("accepts shaped rg lifecycle events and rejects malformed known events", async () => {
  const path = { text: "one/record.jsonl" }, elapsed = { secs: 0, nanos: 1, human: "0.000000001s" };
  const stats = { elapsed, searches: 1, searches_with_match: 1, bytes_searched: 7, bytes_printed: 1, matched_lines: 1, matches: 1 };
  const events = [
    { type: "begin", data: { path } },
    JSON.parse(rg().trim()) as unknown,
    { type: "end", data: { path, binary_offset: null, stats } },
    { type: "summary", data: { elapsed_total: elapsed, stats } },
  ];
  const valid = await harness((child) => { child.stdout.end(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`); child.stderr.end(); queueMicrotask(() => { child.emit("exit", 0, null); child.emit("close", 0, null); }); });
  expect(await valid.promise).toBe(0);
  for (const event of [{ type: "begin", data: {} }, { type: "end", data: { path } }, { type: "summary", data: { stats } }, { type: "context", data: { path, lines: { text: "nearby\n" }, line_number: 1 } }]) {
    const run = await harness((child) => { child.stdout.write(`${JSON.stringify(event)}\n`); child.finish(0); }); await started(run); run.clock.advance(250);
    expect(await run.promise).toBe(4); expect(JSON.parse(Buffer.concat(run.stderr).toString())).toMatchObject({ error: { cause: "dependency-failed" } });
  }
});

test("rejects begin and end lifecycle events for unknown candidate files", async () => {
  const path = { text: "other/record.jsonl" }, elapsed = { secs: 0, nanos: 1, human: "0.000000001s" };
  const stats = { elapsed, searches: 1, searches_with_match: 0, bytes_searched: 0, bytes_printed: 0, matched_lines: 0, matches: 0 };
  for (const event of [{ type: "begin", data: { path } }, { type: "end", data: { path, binary_offset: null, stats } }]) {
    const run = await harness((child) => { child.stdout.write(`${JSON.stringify(event)}\n`); child.finish(0); }); await started(run); run.clock.advance(250);
    expect(await run.promise).toBe(4); expect(JSON.parse(Buffer.concat(run.stderr).toString())).toMatchObject({ error: { cause: "dependency-failed" } });
  }
});

test("captures exact grep probe and search argv with the minimal environment", async () => {
  const held = await home(), clock = new FakeClock(), calls: Array<{ name: string; args: string[]; options: Record<string, unknown> }> = [], stdout: Buffer[] = [], stderr: Buffer[] = [];
  const spawnChild = ((name: string, args: string[], options: Record<string, unknown>) => {
    calls.push({ name, args, options }); const child = new FakeChild();
    queueMicrotask(() => {
      if (name === "rg") { child.pid = undefined; const problem = new Error("missing") as NodeJS.ErrnoException; problem.code = "ENOENT"; child.emit("error", problem); }
      else if (args[0] === "--version") { child.stdout.write("grep controlled\n"); child.finish(0); }
      else { child.stdout.write("one/record.jsonl\u00001:needle\n"); child.finish(0); }
    });
    return child as unknown as ChildProcess;
  }) as unknown as typeof spawn;
  const exit = await runSearchCommand(["--json", "--home", held, "--", "needle"], { cwd: held, env: { PATH: "/controlled", SECRET: "hidden" }, stdout: (bytes) => { stdout.push(Buffer.from(bytes)); }, stderr: (bytes) => { stderr.push(Buffer.from(bytes)); }, clock }, { spawn: spawnChild, signalGroup: () => ({ exists: false }) });
  expect(exit).toBe(0); expect(stderr).toHaveLength(0); expect(stdout).toHaveLength(1);
  expect(calls.map((call) => [call.name, call.args])).toEqual([
    ["rg", ["--version"]], ["grep", ["--version"]], ["grep", ["--null", "-a", "-H", "-n", "-F", "--", "needle", "one/record.jsonl"]],
  ]);
  for (const call of calls) expect(call.options["env"]).toEqual({ PATH: "/controlled", LANG: "C", LC_ALL: "C" });
});

test("rejects reordered, repeated, unknown, malformed, diagnostic, stderr, and bad-exit output", async () => {
  const cases: Array<(child: FakeChild) => void> = [
    (child) => { child.stdout.write(rg("one/record.jsonl", 2)); child.stdout.write(rg()); child.finish(0); },
    (child) => { child.stdout.write(rg()); child.stdout.write(rg()); child.finish(0); },
    (child) => { child.stdout.write(rg("other/record.jsonl")); child.finish(0); },
    (child) => { child.stdout.write("{bad}\n"); child.finish(0); },
    (child) => { child.stdout.write(`${JSON.stringify({ type: "error", data: {} })}\n`); child.finish(0); },
    (child) => { child.stderr.write("diagnostic\n"); child.finish(0); },
    (child) => { child.finish(2); },
  ];
  for (const scenario of cases) {
    const run = await harness(scenario); await started(run);
    if (run.signals.length > 0) run.clock.advance(250);
    expect(await run.promise).toBe(4); expect(run.stdout).toHaveLength(0);
    expect(JSON.parse(Buffer.concat(run.stderr).toString())).toMatchObject({ error: { code: "dependency-failed", cause: "dependency-failed" } });
  }
});
