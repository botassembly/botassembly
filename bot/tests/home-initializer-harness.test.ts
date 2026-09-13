import { type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { finished } from "node:stream/promises";
import { expect, test } from "vitest";
import { CREDENTIAL_ENVIRONMENT_NAMES } from "../src/credential-environment.ts";
import { DEFAULT_CHILD_HARNESS_DEADLINES, launchInitializer, type ChildHarnessReason } from "./home-initializer-harness.ts";

const VALID = `${JSON.stringify({ initialized: true, installationId: "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8" })}\n`;
const DIAGNOSTIC = `${JSON.stringify({ name: "Error", causeCode: "record-changed", exit: 5, published: false, systemCodes: ["EIO"] })}\n`;
const SHORT = { ready: 15, settlement: 15, cleanup: 15 };

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  connected = true;
  killed = 0;
  disconnected = 0;
  settleOnKill = true;
  errorOnKill = false;
  throwDisconnect = false;
  throwKill = false;
  throwSend = false;
  send(): boolean { if (this.throwSend) throw new Error("hidden send failure"); return true; }
  disconnect(): void {
    if (this.throwDisconnect) throw new Error("hidden disconnect failure");
    this.connected = false; this.disconnected += 1; this.emit("disconnect");
  }
  kill(): boolean {
    if (this.throwKill) throw new Error("hidden kill failure");
    this.killed += 1;
    if (this.errorOnKill) this.emit("error", new Error("hidden cleanup error"));
    if (this.settleOnKill) queueMicrotask(() => { this.settle(null, "SIGKILL"); });
    return true;
  }
  settle(code: number | null, signal: NodeJS.Signals | null, closeCode = code, closeSignal = signal): void {
    this.emit("exit", code, signal); this.stdout.end(); this.stderr.end(); this.emit("close", closeCode, closeSignal);
  }
}

function harness(fake: FakeChild, deadlines = SHORT) {
  return launchInitializer({ executable: "unused", arguments: [], botHome: "/fixture/bot-home",
    deadlines, launch: () => fake as unknown as ChildProcess });
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const outer = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { reject(new Error("The harness exceeded its fixed outer bound.")); }, 2_000);
  });
  return Promise.race([promise, outer]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}

function start(fake: FakeChild): void { fake.emit("spawn"); }
function markReady(fake: FakeChild): void { start(fake); fake.emit("message", "ready"); }

async function resultFor(reason: ChildHarnessReason, arrange: (fake: FakeChild, run: ReturnType<typeof harness>) => void) {
  const fake = new FakeChild(), run = harness(fake);
  queueMicrotask(() => { arrange(fake, run); });
  const result = await bounded(run.result);
  expect(result.reason).toBe(reason);
  return { fake, result };
}

test("production fixture deadlines remain explicit", () => {
  expect(DEFAULT_CHILD_HARNESS_DEADLINES).toEqual({ ready: 5_000, settlement: 5_000, cleanup: 1_000 });
});

test("the child environment removes the complete shared credential registry and separates HOME", async () => {
  const fake = new FakeChild();
  let names: string[] = [], childHome: string | undefined;
  const run = launchInitializer({ executable: "unused", arguments: [], botHome: "/fixture/bot-home", deadlines: SHORT,
    launch: (_executable, _arguments, env) => { names = Object.keys(env); childHome = env.HOME; return fake as unknown as ChildProcess; } });
  markReady(fake); fake.stdout.write(VALID); fake.settle(0, null);
  await bounded(run.result);
  expect([...CREDENTIAL_ENVIRONMENT_NAMES].every((name) => !names.includes(name))).toBe(true);
  expect(childHome).toBe("/fixture");
});

test("spawn-error wins and permits absent process events after forced cleanup", async () => {
  const { fake, result } = await resultFor("spawn-error", (child) => { child.settleOnKill = false; child.emit("error", new Error("hidden")); });
  expect({ exit: result.exit, close: result.close }).toEqual({ exit: { present: false, code: null, signal: null },
    close: { present: false, code: null, signal: null } });
  expect({ killed: fake.killed, disconnected: fake.disconnected }).toEqual({ killed: 1, disconnected: 1 });
});

test("child-error wins after spawn", async () => {
  await resultFor("child-error", (fake) => { start(fake); fake.emit("error", new Error("hidden")); });
});

test("ready-timeout forces bounded cleanup", async () => {
  const { fake } = await resultFor("ready-timeout", start);
  expect(fake.killed).toBe(1);
});

test("ready-timeout remains selected when forced kill emits child error", async () => {
  await resultFor("ready-timeout", (fake) => { fake.errorOnKill = true; start(fake); });
});

test("exit-before-ready wins over close-before-ready", async () => {
  await resultFor("exit-before-ready", (fake) => { start(fake); fake.settle(1, null); });
});

test("close-before-ready remains bounded when exit is absent", async () => {
  await resultFor("close-before-ready", (fake) => { fake.settleOnKill = false; start(fake); fake.emit("close", 1, null); });
});

test("ipc-disconnected before ready has its stable reason", async () => {
  await resultFor("ipc-disconnected", (fake) => { fake.settleOnKill = false; start(fake); fake.disconnect(); });
});

test("settlement-timeout begins only after release and forces cleanup", async () => {
  const fake = new FakeChild(), run = harness(fake);
  markReady(fake); await run.ready; run.release();
  expect((await bounded(run.result)).reason).toBe("settlement-timeout");
});

test("settlement-timeout remains selected when forced kill emits child error", async () => {
  const fake = new FakeChild(); fake.errorOnKill = true;
  const run = harness(fake); markReady(fake); await run.ready; run.release();
  expect((await bounded(run.result)).reason).toBe("settlement-timeout");
});

test("cleanup-timeout wins when forced cleanup produces no process events", async () => {
  await resultFor("cleanup-timeout", (fake) => { fake.settleOnKill = false; markReady(fake); fake.stdout.destroy(new Error("hidden")); });
});

test("stdout-error is stable after prompt forced cleanup", async () => {
  const fake = new FakeChild(), run = harness(fake); markReady(fake);
  fake.stderr.end(); await finished(fake.stderr); fake.stdout.destroy(new Error("hidden"));
  expect((await bounded(run.result)).reason).toBe("stdout-error");
});

test("stderr-error is stable after prompt forced cleanup", async () => {
  const fake = new FakeChild(), run = harness(fake); markReady(fake);
  fake.stdout.end(VALID); await finished(fake.stdout); fake.stderr.destroy(new Error("hidden"));
  expect((await bounded(run.result)).reason).toBe("stderr-error");
});

test("stdout finished rejection is an error without a stream error event", async () => {
  const fake = new FakeChild(), run = harness(fake); markReady(fake);
  fake.stderr.end(); await finished(fake.stderr); fake.stdout.write(VALID); fake.stdout.destroy();
  expect((await bounded(run.result)).reason).toBe("stdout-error");
});

test("stderr finished rejection is an error without a stream error event", async () => {
  const fake = new FakeChild(), run = harness(fake); markReady(fake);
  fake.stdout.end(VALID); await finished(fake.stdout); fake.stderr.write(DIAGNOSTIC); fake.stderr.destroy();
  expect((await bounded(run.result)).reason).toBe("stderr-error");
});

test("stdout-error wins when both streams fail", async () => {
  await resultFor("stdout-error", (fake) => { markReady(fake); fake.stdout.destroy(new Error("hidden")); fake.stderr.destroy(new Error("hidden")); });
});

test("exit and close disagreement reports bounded status facts", async () => {
  const { result } = await resultFor("status-disagreement", (fake) => { markReady(fake); fake.settle(0, null, 1, null); });
  expect({ exit: result.exit, close: result.close }).toEqual({ exit: { present: true, code: 0, signal: null },
    close: { present: true, code: 1, signal: null } });
});

test("out-of-contract codes and signals are reduced to null", async () => {
  const fake = new FakeChild(), run = harness(fake);
  markReady(fake); fake.stderr.write(DIAGNOSTIC);
  fake.settle(999, "unsafe-signal" as NodeJS.Signals, 999, "unsafe-signal" as NodeJS.Signals);
  const result = await bounded(run.result);
  expect({ exit: result.exit, close: result.close }).toEqual({ exit: { present: true, code: null, signal: null },
    close: { present: true, code: null, signal: null } });
});

test("stdout overflow wins, drains all bytes, and hashes the full stream", async () => {
  const bytes = Buffer.alloc(1_100, 0x61);
  const { result } = await resultFor("stdout-overflow", (fake) => { markReady(fake); fake.stdout.write(bytes); fake.settle(0, null); });
  expect(result.stdout).toEqual({ bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), overflow: true });
});

test("stderr overflow wins after stdout and hashes the full stream", async () => {
  const bytes = Buffer.alloc(4_200, 0x62);
  const { result } = await resultFor("stderr-overflow", (fake) => { markReady(fake); fake.stdout.write(VALID); fake.stderr.write(bytes); fake.settle(0, null); });
  expect(result.stderr).toEqual({ bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), overflow: true });
});

test("stdout overflow wins when both streams overflow", async () => {
  await resultFor("stdout-overflow", (fake) => { markReady(fake); fake.stdout.write(Buffer.alloc(1_100));
    fake.stderr.write(Buffer.alloc(4_200)); fake.settle(0, null); });
});

test("success-invalid rejects malformed success output without reporting it", async () => {
  await resultFor("success-invalid", (fake) => { markReady(fake); fake.stdout.write("hidden malformed output"); fake.settle(0, null); });
});

test("diagnostic-invalid rejects malformed failure output without reporting it", async () => {
  const planted = "unique-private-output-should-never-return";
  const { result } = await resultFor("diagnostic-invalid", (fake) => { markReady(fake); fake.stderr.write(planted); fake.settle(1, null); });
  expect(JSON.stringify(result)).not.toContain(planted.slice(0, 5));
});

test("one exact diagnostic is allowlisted and no raw output is returned", async () => {
  const fake = new FakeChild(), run = harness(fake);
  markReady(fake); fake.stderr.write(DIAGNOSTIC); fake.settle(1, null);
  const result = await bounded(run.result);
  expect(result.reason).toBeUndefined();
  expect(result.diagnostic).toEqual({ name: "Error", causeCode: "record-changed", exit: 5, published: false, systemCodes: ["EIO"] });
  expect(Object.keys(result).sort()).toEqual(["close", "diagnostic", "exit", "reason", "stderr", "stdout"]);
});

test.each([
  { name: "1Error", systemCodes: [] },
  { name: "Error", systemCodes: [], extra: "hidden" },
  { name: "Error", causeCode: "UPPER", systemCodes: [] },
  { name: "Error", exit: 2, systemCodes: [] },
  { name: "Error", published: "false", systemCodes: [] },
  { name: "Error", systemCodes: Array.from({ length: 9 }, () => "EIO") },
  { name: "Error", systemCodes: ["lowercase"] },
] as const)("diagnostic-invalid rejects a non-allowlisted diagnostic %#", async (diagnostic) => {
  const fake = new FakeChild(), run = harness(fake);
  markReady(fake); fake.stderr.write(`${JSON.stringify(diagnostic)}\n`); fake.settle(1, null);
  const result = await bounded(run.result);
  expect(result.reason).toBe("diagnostic-invalid"); expect(result.diagnostic).toBeUndefined();
});

test("output that closes after exit is included in counts and hashes", async () => {
  const fake = new FakeChild(), run = harness(fake);
  markReady(fake); fake.emit("exit", 0, null); fake.stdout.end(VALID); fake.stderr.end(); fake.emit("close", 0, null);
  const result = await bounded(run.result);
  expect(result.reason).toBeUndefined();
  expect(result.stdout).toEqual({ bytes: Buffer.byteLength(VALID), sha256: createHash("sha256").update(VALID).digest("hex"), overflow: false });
});

test("cleanup expiry freezes digests and ignores later stream and process events", async () => {
  const fake = new FakeChild(); fake.settleOnKill = false;
  const run = harness(fake); markReady(fake); fake.stdout.destroy(new Error("hidden"));
  const result = await bounded(run.result), snapshot = JSON.stringify(result);
  expect(() => { fake.stdout.emit("data", Buffer.from("late-hidden")); fake.emit("exit", 1, null); fake.emit("close", 1, null); }).not.toThrow();
  expect(JSON.stringify(result)).toBe(snapshot);
});

test.each(["disconnect", "kill"] as const)("ready deadline survives a throwing cleanup %s", async (operation) => {
  await resultFor("ready-timeout", (fake) => { fake.settleOnKill = false;
    if (operation === "disconnect") fake.throwDisconnect = true; else fake.throwKill = true; start(fake); });
});

test("a throwing release send becomes child-error after its timer is armed", async () => {
  const fake = new FakeChild(); fake.throwSend = true;
  const run = harness(fake); markReady(fake); await run.ready;
  expect(() => { run.release(); }).not.toThrow();
  expect((await bounded(run.result)).reason).toBe("child-error");
});

test("an unexpected IPC message does not satisfy readiness", async () => {
  await resultFor("ready-timeout", (fake) => { start(fake); fake.emit("message", { ready: true }); });
});
