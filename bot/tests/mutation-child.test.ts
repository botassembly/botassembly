import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, test, vi } from "vitest";
import {
  MUTATION_FINAL_SETTLEMENT_MS, MUTATION_TERM_GRACE_MS, runMutationChild,
} from "../src/mutation-child.ts";

class FakeChild extends EventEmitter {
  stdin = new PassThrough(); stdout = new PassThrough(); stderr = new PassThrough();
  signals: NodeJS.Signals[] = [];
  killResult: boolean | Error = true;
  killResults: (boolean | Error)[] = [];
  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    const result = this.killResults.shift() ?? this.killResult;
    if (result instanceof Error) throw result;
    return result;
  }
  spawned(): void { this.emit("spawn"); }
  settle(code: number | null, signal: NodeJS.Signals | null): void {
    queueMicrotask(() => { this.stdin.destroy(); });
    this.stdout.end(); this.stderr.end(); this.emit("exit", code, signal); this.emit("close", code, signal);
  }
}

afterEach(() => { vi.useRealTimers(); });

function processCommand(pid: number): string | undefined {
  const probe = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  if (probe.error !== undefined) throw probe.error;
  if (probe.status === 1) return undefined;
  if (probe.status !== 0) throw new Error(`ps failed for ${String(pid)}: ${probe.stderr}`);
  return probe.stdout.trim();
}

function ownedPids(identity: string): number[] {
  const probe = spawnSync("ps", ["-eo", "pid=,command="], { encoding: "utf8" });
  if (probe.error !== undefined) throw probe.error;
  if (probe.status !== 0) throw new Error(`process inventory failed: ${probe.stderr}`);
  return probe.stdout.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(.*)$/u.exec(line);
    return match !== null && match[2]?.includes(identity) === true ? [Number(match[1])] : [];
  });
}

function isEsrch(reason: unknown): boolean {
  return reason instanceof Error && "code" in reason && reason.code === "ESRCH";
}

function killOwnedProcess(pid: number, identity: string): void {
  const command = processCommand(pid);
  if (command === undefined || !command.includes(identity)) return;
  try { process.kill(pid, "SIGKILL"); } catch (reason) { if (!isEsrch(reason)) throw reason; }
}

async function removeOwnedProcesses(owned: readonly { identity: string; pid: number | undefined }[]): Promise<void> {
  for (const target of owned) {
    const pids = new Set([...(target.pid === undefined ? [] : [target.pid]), ...ownedPids(target.identity)]);
    for (const pid of pids) killOwnedProcess(pid, target.identity);
  }
  const deadline = Date.now() + 5_000;
  while (owned.some(({ identity }) => ownedPids(identity).length > 0) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  for (const { identity } of owned) expect(ownedPids(identity), `owned process remained: ${identity}`).toEqual([]);
}

test("the mutation child pins the direct invocation and preserves separate bytes", async () => {
  const child = new FakeChild(), calls: unknown[][] = [];
  const promise = runMutationChild(["run", "start", "--json"], "/work", { MARK: "held" }, { stdin: Buffer.from([0, 255]) }, {
    spawn: ((...args: unknown[]) => { calls.push(args); return child; }) as never,
  });
  const input: Buffer[] = []; child.stdin.on("data", (bytes: Buffer) => { input.push(Buffer.from(bytes)); });
  child.stdout.write(Buffer.from([1, 2])); child.stderr.write(Buffer.from([3, 4])); child.settle(7, null);
  await expect(promise).resolves.toEqual({ exit: 7, stdout: Buffer.from([1, 2]), stderr: Buffer.from([3, 4]) });
  expect(input).toEqual([Buffer.from([0, 255])]);
  expect(calls[0]?.[0]).toBe(process.execPath);
  expect(calls[0]?.[1]).toEqual([expect.stringMatching(/src\/cli\.ts$/u), "run", "start", "--json"]);
  expect(calls[0]?.[2]).toMatchObject({ cwd: "/work", env: { MARK: "held" }, shell: false, stdio: ["pipe", "pipe", "pipe"] });
});

test("an abort sends one TERM and returns a coherent handled result", async () => {
  const child = new FakeChild(), controller = new AbortController();
  const promise = runMutationChild([], "/work", {}, { signal: controller.signal }, { spawn: (() => child) as never });
  controller.abort();
  expect(child.signals).toEqual(["SIGTERM"]);
  child.stdout.write("held"); child.settle(null, "SIGTERM");
  await expect(promise).resolves.toMatchObject({ exit: 143, stdout: Buffer.from("held") });
  expect(child.signals).toEqual(["SIGTERM"]);
});

test("abort escalation uses the published timers, one KILL, and rejects after cleanup", async () => {
  vi.useFakeTimers();
  const child = new FakeChild(), controller = new AbortController();
  const promise = runMutationChild([], "/work", {}, { signal: controller.signal }, { spawn: (() => child) as never });
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS);
  expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
  expect([child.stdin.destroyed, child.stdout.destroyed, child.stderr.destroyed]).toEqual([true, true, true]);
  await vi.advanceTimersByTimeAsync(MUTATION_FINAL_SETTLEMENT_MS);
  await rejected;
  expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
});

test("TERM ESRCH permanently suppresses KILL while the final deadline remains bounded", async () => {
  vi.useFakeTimers();
  const child = new FakeChild(), controller = new AbortController();
  child.killResult = Object.assign(new Error("gone"), { code: "ESRCH" });
  const promise = runMutationChild([], "/work", {}, { signal: controller.signal }, { spawn: (() => child) as never });
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS + MUTATION_FINAL_SETTLEMENT_MS);
  await rejected;
  expect(child.signals).toEqual(["SIGTERM"]);
});

test("TERM ESRCH returns a fully settled coherent result without a later signal", async () => {
  vi.useFakeTimers();
  const child = new FakeChild(), controller = new AbortController();
  child.killResult = Object.assign(new Error("gone"), { code: "ESRCH" });
  const promise = runMutationChild([], "/work", {}, { signal: controller.signal }, { spawn: (() => child) as never });
  controller.abort(); child.stdout.write("settled"); child.stdout.end(); child.stderr.end();
  await new Promise<void>((resolve) => { child.stdin.once("finish", resolve); }); child.stdin.destroy();
  await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS);
  child.emit("exit", 0, null); child.emit("close", 0, null);
  await expect(promise).resolves.toMatchObject({ exit: 0, stdout: Buffer.from("settled") });
  await vi.advanceTimersByTimeAsync(MUTATION_FINAL_SETTLEMENT_MS);
  expect(child.signals).toEqual(["SIGTERM"]); expect(vi.getTimerCount()).toBe(0);
});

test("a non-ESRCH TERM failure remains the rejection through bounded cleanup", async () => {
  vi.useFakeTimers();
  const child = new FakeChild(), controller = new AbortController(), denied = Object.assign(new Error("denied"), { code: "EPERM" });
  child.killResult = denied;
  const promise = runMutationChild([], "/work", {}, { signal: controller.signal }, { spawn: (() => child) as never });
  const rejected = expect(promise).rejects.toBe(denied);
  controller.abort();
  await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS + MUTATION_FINAL_SETTLEMENT_MS);
  await rejected; expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]); expect(vi.getTimerCount()).toBe(0);
});

test("an unsupported native platform never receives wrapper SIGKILL", async () => {
  vi.useFakeTimers();
  const child = new FakeChild(), controller = new AbortController();
  const promise = runMutationChild([], "/work", {}, { signal: controller.signal }, { spawn: (() => child) as never, platform: "win32" });
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS + MUTATION_FINAL_SETTLEMENT_MS);
  await rejected; expect(child.signals).toEqual(["SIGTERM"]);
});

test("spawn failure rejects immediately and status disagreement rejects after settlement", async () => {
  const spawnFailure = new Error("spawn failed");
  await expect(runMutationChild([], "/work", {}, {}, { spawn: () => { throw spawnFailure; } })).rejects.toBe(spawnFailure);

  const child = new FakeChild();
  const promise = runMutationChild([], "/work", {}, {}, { spawn: (() => child) as never });
  child.stdout.end(); child.stderr.end(); child.emit("close", 0, null); child.emit("exit", 1, null);
  queueMicrotask(() => { child.stdin.destroy(); });
  await expect(promise).rejects.toThrow("exit and close status disagree");
});

test("an emitted pre-spawn error rejects without signaling an unowned pid", async () => {
  const child = new FakeChild(), failure = new Error("exec failed");
  const promise = runMutationChild([], "/work", {}, {}, { spawn: (() => child) as never });
  child.emit("error", failure);
  await expect(promise).rejects.toBe(failure);
  expect(child.signals).toEqual([]);
});

test("an already aborted input rejects before spawn", async () => {
  const controller = new AbortController(); controller.abort();
  const spawn = vi.fn();
  await expect(runMutationChild([], "/work", {}, { signal: controller.signal }, { spawn: spawn as never }))
    .rejects.toMatchObject({ name: "AbortError" });
  expect(spawn).not.toHaveBeenCalled();
});

test("an emitted post-spawn signal error takes bounded cleanup before rejection", async () => {
  vi.useFakeTimers();
  const child = new FakeChild(), denied = Object.assign(new Error("signal denied"), { code: "EPERM" });
  const promise = runMutationChild([], "/work", {}, {}, { spawn: (() => child) as never });
  const rejected = expect(promise).rejects.toBe(denied);
  child.spawned(); child.emit("error", denied);
  expect(child.signals).toEqual(["SIGTERM"]);
  await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS + MUTATION_FINAL_SETTLEMENT_MS);
  await rejected;
  expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
  expect([child.stdin.destroyed, child.stdout.destroyed, child.stderr.destroyed]).toEqual([true, true, true]);
});

test("later emitted child errors stay on the same cleanup path", async () => {
  vi.useFakeTimers();
  const child = new FakeChild(), first = new Error("first transport failure"), later = new Error("later transport failure");
  const promise = runMutationChild([], "/work", {}, {}, { spawn: (() => child) as never });
  const rejected = expect(promise).rejects.toBe(first);
  child.spawned(); child.emit("error", first); child.emit("error", later);
  await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS + MUTATION_FINAL_SETTLEMENT_MS);
  await rejected;
  expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
});

test("a synchronous stdin close failure takes TERM, disposal, and final settlement", async () => {
  vi.useFakeTimers();
  const child = new FakeChild(), failure = new Error("stdin close failed");
  child.stdin.end = (() => { throw failure; }) as never;
  const promise = runMutationChild([], "/work", {}, {}, { spawn: (() => child) as never });
  const rejected = expect(promise).rejects.toBe(failure);
  expect(child.signals).toEqual(["SIGTERM"]);
  await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS + MUTATION_FINAL_SETTLEMENT_MS);
  await rejected;
  expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
  expect([child.stdin.destroyed, child.stdout.destroyed, child.stderr.destroyed]).toEqual([true, true, true]);
});

test("an abort during spawn is caught by the listener recheck", async () => {
  vi.useFakeTimers();
  const child = new FakeChild(), controller = new AbortController();
  const promise = runMutationChild([], "/work", {}, { signal: controller.signal }, {
    spawn: (() => { controller.abort(); return child; }) as never,
  });
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  expect(child.signals).toEqual(["SIGTERM"]);
  await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS + MUTATION_FINAL_SETTLEMENT_MS);
  await rejected;
});

for (const stream of ["stdout", "stderr"] as const) {
  test(`${stream} errors receive one bounded cleanup path`, async () => {
    vi.useFakeTimers();
    const child = new FakeChild(), failure = new Error(`${stream} failed`);
    const promise = runMutationChild([], "/work", {}, {}, { spawn: (() => child) as never });
    const rejected = expect(promise).rejects.toBe(failure);
    child.spawned(); child[stream].emit("error", failure);
    await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS + MUTATION_FINAL_SETTLEMENT_MS);
    await rejected;
    expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });
}

test("an asynchronous stdin write failure receives bounded cleanup", async () => {
  vi.useFakeTimers();
  const child = new FakeChild(), failure = new Error("stdin write failed");
  const promise = runMutationChild([], "/work", {}, {}, { spawn: (() => child) as never });
  const rejected = expect(promise).rejects.toBe(failure);
  child.spawned(); child.stdin.emit("error", failure);
  await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS + MUTATION_FINAL_SETTLEMENT_MS);
  await rejected;
  expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
});

test("KILL ESRCH ends signaling and retains the abort rejection", async () => {
  vi.useFakeTimers();
  const child = new FakeChild(), controller = new AbortController();
  child.killResults = [true, Object.assign(new Error("gone"), { code: "ESRCH" })];
  const promise = runMutationChild([], "/work", {}, { signal: controller.signal }, { spawn: (() => child) as never });
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  child.spawned(); controller.abort();
  await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS + MUTATION_FINAL_SETTLEMENT_MS);
  await rejected;
  expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
});

test("a non-ESRCH KILL failure survives endpoint cleanup", async () => {
  vi.useFakeTimers();
  const child = new FakeChild(), controller = new AbortController(), denied = Object.assign(new Error("kill denied"), { code: "EPERM" });
  child.killResults = [true, denied];
  const promise = runMutationChild([], "/work", {}, { signal: controller.signal }, { spawn: (() => child) as never });
  const rejected = expect(promise).rejects.toBe(denied);
  child.spawned(); controller.abort();
  await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS + MUTATION_FINAL_SETTLEMENT_MS);
  await rejected;
  expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
});

test("a direct SIGTERM ending before run birth returns numeric exit 143", async () => {
  const child = new FakeChild();
  const promise = runMutationChild([], "/work", {}, {}, { spawn: (() => child) as never });
  child.spawned(); child.settle(null, "SIGTERM");
  await expect(promise).resolves.toEqual({ exit: 143, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
});

for (const missing of ["exit", "close"] as const) {
  test(`a missing ${missing} reaches the final deadline and removes the abort listener`, async () => {
    vi.useFakeTimers();
    const child = new FakeChild(), controller = new AbortController();
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    const promise = runMutationChild([], "/work", {}, { signal: controller.signal }, { spawn: (() => child) as never });
    const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    child.spawned(); controller.abort(); child.stdin.destroy(); child.stdout.end(); child.stderr.end();
    child.emit(missing === "exit" ? "close" : "exit", null, "SIGTERM");
    await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS + MUTATION_FINAL_SETTLEMENT_MS);
    await rejected;
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
}

for (const held of ["stdout", "stderr"] as const) {
  test(`a descendant-held ${held} pipe is disposed at the bounded deadline`, async () => {
    vi.useFakeTimers();
    const child = new FakeChild(), controller = new AbortController();
    const promise = runMutationChild([], "/work", {}, { signal: controller.signal }, { spawn: (() => child) as never });
    const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    child.spawned(); controller.abort(); child.stdin.destroy(); child[held === "stdout" ? "stderr" : "stdout"].end();
    child.emit("exit", null, "SIGTERM"); child.emit("close", null, "SIGTERM");
    await vi.advanceTimersByTimeAsync(MUTATION_TERM_GRACE_MS + MUTATION_FINAL_SETTLEMENT_MS);
    await rejected;
    expect(child[held].destroyed).toBe(true);
  });
}

test("close-before-exit settles with the same coherent result", async () => {
  const child = new FakeChild();
  const promise = runMutationChild([], "/work", {}, {}, { spawn: (() => child) as never });
  child.spawned(); child.stdin.destroy(); child.stdout.end("out"); child.stderr.end("err");
  child.emit("close", 4, null); child.emit("exit", 4, null);
  await expect(promise).resolves.toEqual({ exit: 4, stdout: Buffer.from("out"), stderr: Buffer.from("err") });
});

test.skipIf(process.platform !== "linux" && process.platform !== "darwin")(
  "a real killed child and its pipe-holding descendant are gone before rejection",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "bot-mutation-real-child-"));
    const preload = join(root, "preload.mjs"), descendant = join(root, "descendant.mjs");
    const marker = join(root, "ready"), directPid = join(root, "direct.pid"), descendantPid = join(root, "descendant.pid"), done = join(root, "descendant.done");
    const ownerIdentity = `bot-mutation-owner-${root.slice(root.lastIndexOf("-") + 1)}`;
    let directProcessPid: number | undefined, descendantProcessPid: number | undefined;
    let controller: AbortController | undefined;
    let promise: Promise<unknown> | undefined;
    try {
      await writeFile(descendant, [
        'import { spawnSync } from "node:child_process";',
        'import { writeFileSync } from "node:fs";',
        'const done = process.env["DESCENDANT_DONE"];',
        'const owner = process.ppid; const identity = process.env["OWNER_ID"]; let finished = false;',
        'const finish = () => { if (finished) return; finished = true; writeFileSync(done, "ended"); process.exit(0); };',
        'process.stdout.on("error", finish); process.stderr.on("error", finish); process.on("SIGTERM", finish);',
        'setInterval(() => { const command = spawnSync("ps", ["-p", String(owner), "-o", "command="], { encoding: "utf8" }).stdout; if (!command.includes(identity)) finish(); process.stdout.write("held stdout\\n"); process.stderr.write("held stderr\\n"); }, 10);',
      ].join("\n"));
      await writeFile(preload, [
        'import { spawn } from "node:child_process";',
        'import { writeFileSync } from "node:fs";',
        'process.on("SIGTERM", () => {});',
        'writeFileSync(process.env["DIRECT_PID"], String(process.pid));',
        'const env = { ...process.env }; delete env.NODE_OPTIONS;',
        'const child = spawn(process.execPath, [process.env["DESCENDANT_SCRIPT"]], { detached: true, stdio: ["ignore", process.stdout, process.stderr], env });',
        'writeFileSync(process.env["DESCENDANT_PID"], String(child.pid)); child.unref();',
        'writeFileSync(process.env["READY"], "ready");',
        'setInterval(() => {}, 1000); await new Promise(() => {});',
      ].join("\n"));
      controller = new AbortController();
      promise = runMutationChild([ownerIdentity], root, {
        ...process.env, NODE_OPTIONS: `--import=${preload}`, READY: marker, DIRECT_PID: directPid,
        DESCENDANT_SCRIPT: descendant, DESCENDANT_PID: descendantPid, DESCENDANT_DONE: done, OWNER_ID: ownerIdentity,
      }, { signal: controller.signal });
      void promise.catch(() => undefined);
      const deadline = Date.now() + 10_000;
      while (!existsSync(marker) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
      expect(existsSync(marker)).toBe(true);
      directProcessPid = Number(await readFile(directPid, "utf8"));
      descendantProcessPid = Number(await readFile(descendantPid, "utf8"));
      expect(processCommand(directProcessPid)).toContain(ownerIdentity);
      expect(processCommand(descendantProcessPid)).toContain(descendant);
      expect(existsSync(done)).toBe(false);
      controller.abort();
      await expect(promise).rejects.toMatchObject({ name: "AbortError" });
      expect(existsSync(done)).toBe(true);
      expect(ownedPids(ownerIdentity)).toEqual([]);
      expect(ownedPids(descendant)).toEqual([]);
    } finally {
      controller?.abort();
      const readPid = async (path: string): Promise<number | undefined> => {
        try { return Number(await readFile(path, "utf8")); } catch (reason) {
          if (reason instanceof Error && "code" in reason && reason.code === "ENOENT") return undefined;
          throw reason;
        }
      };
      directProcessPid ??= await readPid(directPid);
      descendantProcessPid ??= await readPid(descendantPid);
      await removeOwnedProcesses([
        { identity: ownerIdentity, pid: directProcessPid }, { identity: descendant, pid: descendantProcessPid },
      ]);
      if (promise !== undefined) await promise.catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000,
);
