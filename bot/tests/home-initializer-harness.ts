import { spawn, type ChildProcess } from "node:child_process";
import { createHash, type Hash } from "node:crypto";
import { finished } from "node:stream/promises";
import type { Readable } from "node:stream";
import { dirname } from "node:path";
import { CREDENTIAL_ENVIRONMENT_NAMES } from "../src/credential-environment.ts";

const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");
export const DEFAULT_CHILD_HARNESS_DEADLINES: ChildHarnessDeadlines = { ready: 5_000, settlement: 5_000, cleanup: 1_000 };
const REASONS = ["spawn-error", "child-error", "ready-timeout", "exit-before-ready", "close-before-ready",
  "ipc-disconnected", "settlement-timeout", "cleanup-timeout", "stdout-error", "stderr-error", "status-disagreement",
  "stdout-overflow", "stderr-overflow", "success-invalid", "diagnostic-invalid"] as const;
export type ChildHarnessReason = typeof REASONS[number];

export interface ChildHarnessDeadlines { readonly ready: number; readonly settlement: number; readonly cleanup: number }
export interface ProcessEventFact { readonly present: boolean; readonly code: number | null; readonly signal: string | null }
export interface OutputFact { readonly bytes: number; readonly sha256: string; readonly overflow: boolean }
export interface ChildDiagnostic {
  readonly name: string;
  readonly causeCode?: string;
  readonly exit?: 3 | 4 | 5;
  readonly published?: boolean;
  readonly systemCodes: readonly string[];
}
export interface ChildHarnessResult {
  readonly reason: ChildHarnessReason | undefined;
  readonly exit: ProcessEventFact;
  readonly close: ProcessEventFact;
  readonly stdout: OutputFact;
  readonly stderr: OutputFact;
  readonly diagnostic: ChildDiagnostic | undefined;
}

interface LaunchOptions {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly botHome: string;
  readonly deadlines?: Partial<ChildHarnessDeadlines>;
  readonly launch?: (executable: string, arguments_: readonly string[], environment: NodeJS.ProcessEnv) => ChildProcess;
}

interface Capture {
  readonly chunks: Buffer[];
  readonly hash: Hash;
  bytes: number;
  retained: number;
  overflow: boolean;
  failed: boolean;
  done: boolean;
  active: boolean;
}

function capture(stream: Readable, limit: number, failed: () => void): Capture {
  const held: Capture = { chunks: [], hash: createHash("sha256"), bytes: 0, retained: 0,
    overflow: false, failed: false, done: false, active: true };
  stream.on("data", (value: Buffer | string) => {
    if (!held.active) return;
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    held.bytes += bytes.length; held.hash.update(bytes);
    const room = Math.max(0, limit - held.retained);
    if (room > 0) { const part = bytes.subarray(0, room); held.chunks.push(part); held.retained += part.length; }
    if (held.bytes > limit) held.overflow = true;
  });
  stream.on("error", () => { if (held.active) held.failed = true; failed(); });
  void finished(stream).then(() => { held.done = true; failed(); }, () => { if (held.active) held.failed = true; held.done = true; failed(); });
  return held;
}

function environment(home: string): NodeJS.ProcessEnv {
  const env = { ...process.env, HOME: dirname(home) };
  for (const name of CREDENTIAL_ENVIRONMENT_NAMES) Reflect.deleteProperty(env, name);
  return env;
}

function safeCode(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value >= 0 && value <= 255 ? value : null;
}

function safeSignal(value: NodeJS.Signals | null): string | null {
  return value !== null && /^SIG[A-Z0-9]+$/u.test(value) && Buffer.byteLength(value) <= 32 ? value : null;
}

function exactObject(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).every((name) => names.includes(name)) && Object.keys(value).length === names.length;
}

function validName(value: unknown): value is string {
  return typeof value === "string" && Buffer.byteLength(value) <= 64 && /^[A-Za-z][A-Za-z0-9]*$/u.test(value);
}

function validCauseCode(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && Buffer.byteLength(value) <= 64 && /^[a-z0-9-]+$/u.test(value));
}

function validDiagnosticExit(value: unknown): value is 3 | 4 | 5 | undefined {
  return value === undefined || value === 3 || value === 4 || value === 5;
}

function validPublished(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function validSystemCodes(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 8 && value.every((code: unknown) =>
    typeof code === "string" && Buffer.byteLength(code) <= 64 && /^[A-Z][A-Z0-9_]*$/u.test(code));
}

function validDiagnosticKeys(keys: readonly string[]): boolean {
  return keys.length >= 2 && keys.length <= 5
    && keys.every((key) => ["name", "causeCode", "exit", "published", "systemCodes"].includes(key))
    && keys.includes("name") && keys.includes("systemCodes");
}

function validDiagnosticFields(record: Record<string, unknown>): boolean {
  return validName(record.name) && validCauseCode(record.causeCode) && validDiagnosticExit(record.exit)
    && validPublished(record.published) && validSystemCodes(record.systemCodes);
}

function diagnosticRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function optionalCauseCode(value: string | undefined): { causeCode?: string } {
  return value === undefined ? {} : { causeCode: value };
}

function optionalExit(value: 3 | 4 | 5 | undefined): { exit?: 3 | 4 | 5 } {
  return value === undefined ? {} : { exit: value };
}

function optionalPublished(value: boolean | undefined): { published?: boolean } {
  return value === undefined ? {} : { published: value };
}

function diagnosticFromRecord(record: Record<string, unknown>): ChildDiagnostic | undefined {
  const keys = Object.keys(record);
  if (!validDiagnosticKeys(keys) || !validDiagnosticFields(record)) return undefined;
  const name = record.name, causeCode = record.causeCode, exit = record.exit;
  const published = record.published, systemCodes = record.systemCodes;
  if (!validName(name) || !validCauseCode(causeCode) || !validDiagnosticExit(exit)
    || !validPublished(published) || !validSystemCodes(systemCodes)) return undefined;
  return { name, ...optionalCauseCode(causeCode), ...optionalExit(exit), ...optionalPublished(published), systemCodes };
}

function parseDiagnostic(bytes: Buffer): ChildDiagnostic | undefined {
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")) as unknown; } catch { return undefined; }
  const record = diagnosticRecord(value);
  return record === undefined ? undefined : diagnosticFromRecord(record);
}

function eventFact(value: { present: boolean; code: number | null; signal: NodeJS.Signals | null }): ProcessEventFact {
  return { present: value.present, code: safeCode(value.code), signal: safeSignal(value.signal) };
}

function statusDisagrees(exit: ProcessEventFact, close: ProcessEventFact): boolean {
  return exit.present && close.present && (exit.code !== close.code || exit.signal !== close.signal);
}

function statusSucceeded(exit: ProcessEventFact, close: ProcessEventFact): boolean {
  return exit.present && close.present && exit.code === 0 && close.code === 0 && exit.signal === null && close.signal === null;
}

function firstReason(facts: readonly boolean[]): ChildHarnessReason | undefined {
  return REASONS[facts.findIndex(Boolean)];
}

function outputFact(value: Capture): OutputFact {
  value.active = false;
  return { bytes: value.bytes, sha256: value.hash.digest("hex"), overflow: value.overflow };
}

function completionReady(
  completed: boolean, cleanupTimeout: boolean, exitPresent: boolean, closePresent: boolean, stdoutDone: boolean, stderrDone: boolean,
): boolean {
  return !completed && (cleanupTimeout || (exitPresent && closePresent && stdoutDone && stderrDone));
}

function parseFacts(successful: boolean, stdout: Capture, stderr: Capture, stdoutBytes: Buffer, stderrBytes: Buffer): readonly boolean[] {
  return [successful && (!stdout.done || !successValid(stdoutBytes)), !successful && (!stderr.done || parseDiagnostic(stderrBytes) === undefined)];
}

function usableDiagnostic(successful: boolean, stderr: Capture, bytes: Buffer): ChildDiagnostic | undefined {
  return successful || !stderr.done || stderr.overflow || stderr.failed ? undefined : parseDiagnostic(bytes);
}

function successValid(bytes: Buffer): boolean {
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")) as unknown; } catch { return false; }
  return exactObject(value, ["initialized", "installationId"]) && value.initialized === true && typeof value.installationId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value.installationId);
}

export function launchInitializer(options: LaunchOptions) {
  const deadlines = { ...DEFAULT_CHILD_HARNESS_DEADLINES, ...options.deadlines };
  let child: ChildProcess;
  try {
    child = (options.launch ?? ((executable, arguments_, env) => spawn(executable, [...arguments_],
      { env, stdio: ["ignore", "pipe", "pipe", "ipc"] })))(options.executable, options.arguments, environment(options.botHome));
  } catch {
    const empty = { bytes: 0, sha256: EMPTY_SHA256, overflow: false };
    return { ready: Promise.resolve(), release: () => undefined, result: Promise.resolve({ reason: "spawn-error" as const,
      exit: { present: false, code: null, signal: null }, close: { present: false, code: null, signal: null }, stdout: empty, stderr: empty,
      diagnostic: undefined }) };
  }
  if (child.stdout === null || child.stderr === null) throw new Error("The initializer child must have output pipes.");
  let ready = false, spawned = false, released = false, forcing = false, completed = false;
  let readyTimeout = false, settlementTimeout = false, cleanupTimeout = false, spawnError = false, childError = false;
  let exitBeforeReady = false, closeBeforeReady = false, disconnected = false;
  let exitRaw: { present: boolean; code: number | null; signal: NodeJS.Signals | null } = { present: false, code: null, signal: null };
  let closeRaw = { ...exitRaw };
  let readyResolve!: () => void, resultResolve!: (value: ChildHarnessResult) => void;
  const readyPromise = new Promise<void>((resolve) => { readyResolve = resolve; });
  const result = new Promise<ChildHarnessResult>((resolve) => { resultResolve = resolve; });
  let readyTimer: NodeJS.Timeout | undefined, settlementTimer: NodeJS.Timeout | undefined, cleanupTimer: NodeJS.Timeout | undefined;
  const deadlineChosen = () => readyTimeout || settlementTimeout;
  const noteChildFailure = () => { if (!deadlineChosen()) childError = true; };
  const attemptChildAction = (action: () => void): boolean => {
    try { action(); return true; } catch { noteChildFailure(); return false; }
  };
  const requestCleanup = () => {
    if (forcing) return;
    forcing = true; if (readyTimer !== undefined) clearTimeout(readyTimer); if (settlementTimer !== undefined) clearTimeout(settlementTimer);
    attemptChildAction(() => { if (child.connected) child.disconnect(); });
    attemptChildAction(() => { child.kill("SIGKILL"); });
    child.stdout?.destroy(); child.stderr?.destroy();
    cleanupTimer = setTimeout(() => { cleanupTimeout = true; finish(); }, deadlines.cleanup);
  };
  const streamChanged = () => { if (!completed && (stdout.failed || stderr.failed)) requestCleanup(); finish(); };
  const stdout = capture(child.stdout, 1_024, streamChanged), stderr = capture(child.stderr, 4_096, streamChanged);
  const finish = () => {
    if (!completionReady(completed, cleanupTimeout, exitRaw.present, closeRaw.present, stdout.done, stderr.done)) return;
    completed = true; if (readyTimer !== undefined) clearTimeout(readyTimer); if (settlementTimer !== undefined) clearTimeout(settlementTimer);
    if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
    readyResolve();
    const exit = eventFact(exitRaw), close = eventFact(closeRaw);
    const stdoutBytes = Buffer.concat(stdout.chunks), stderrBytes = Buffer.concat(stderr.chunks);
    const successful = statusSucceeded(exit, close);
    const facts = [spawnError, childError, readyTimeout, exitBeforeReady, closeBeforeReady, disconnected, settlementTimeout,
      cleanupTimeout, stdout.failed, stderr.failed, statusDisagrees(exit, close), stdout.overflow, stderr.overflow,
      ...parseFacts(successful, stdout, stderr, stdoutBytes, stderrBytes)];
    const reason = firstReason(facts);
    const diagnostic = usableDiagnostic(successful, stderr, stderrBytes);
    resultResolve({ reason, exit, close, stdout: outputFact(stdout), stderr: outputFact(stderr), diagnostic });
  };
  child.once("spawn", () => { spawned = true; if (readyTimer !== undefined) clearTimeout(readyTimer);
    readyTimer = setTimeout(() => { readyTimeout = true; readyResolve(); requestCleanup(); }, deadlines.ready); });
  child.on("error", () => { if (!forcing || !deadlineChosen()) { if (spawned) childError = true; else spawnError = true; }
    readyResolve(); requestCleanup(); });
  const readyMessage = (message: unknown) => { if (message !== "ready") return;
    ready = true; child.off("message", readyMessage); if (readyTimer !== undefined) clearTimeout(readyTimer); readyResolve(); };
  child.on("message", readyMessage);
  child.once("exit", (code, signal) => { exitRaw = { present: true, code, signal };
    if (!ready) { exitBeforeReady = true; requestCleanup(); } readyResolve(); finish(); });
  child.once("close", (code, signal) => { closeRaw = { present: true, code, signal };
    if (!ready) { closeBeforeReady = true; requestCleanup(); } readyResolve(); finish(); });
  child.once("disconnect", () => { if (!ready) { disconnected = true; readyResolve(); requestCleanup(); } });
  readyTimer = setTimeout(() => { readyTimeout = true; readyResolve(); requestCleanup(); }, deadlines.ready);
  return { ready: readyPromise, release: () => {
    if (released || completed) return; released = true;
    settlementTimer = setTimeout(() => { settlementTimeout = true; requestCleanup(); }, deadlines.settlement);
    const sent = attemptChildAction(() => { if (child.connected) child.send("release"); });
    if (!sent) requestCleanup();
  }, result };
}
