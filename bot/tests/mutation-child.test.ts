import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, expect, test, vi } from "vitest";
import {
  MUTATION_FINAL_SETTLEMENT_MS, MUTATION_TERM_GRACE_MS, runMutationChild,
} from "../src/mutation-child.ts";

class FakeChild extends EventEmitter {
  stdin = new PassThrough(); stdout = new PassThrough(); stderr = new PassThrough();
  signals: NodeJS.Signals[] = [];
  killResult: boolean | Error = true;
  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    if (this.killResult instanceof Error) throw this.killResult;
    return this.killResult;
  }
  settle(code: number | null, signal: NodeJS.Signals | null): void {
    queueMicrotask(() => { this.stdin.destroy(); });
    this.stdout.end(); this.stderr.end(); this.emit("exit", code, signal); this.emit("close", code, signal);
  }
}

afterEach(() => { vi.useRealTimers(); });

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

test("an already aborted input rejects before spawn", async () => {
  const controller = new AbortController(); controller.abort();
  const spawn = vi.fn();
  await expect(runMutationChild([], "/work", {}, { signal: controller.signal }, { spawn: spawn as never }))
    .rejects.toMatchObject({ name: "AbortError" });
  expect(spawn).not.toHaveBeenCalled();
});
