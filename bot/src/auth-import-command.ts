import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { lstat, mkdir, open, rename, unlink, type FileHandle } from "node:fs/promises";
import { lock, lockSync } from "proper-lockfile";
import { jsonObject } from "./check.ts";
import { AUTH_IMPORT_CONTRACT } from "./cli-contract.ts";
import { errorCode, mapping, plainly } from "./model.ts";
import { inertText } from "./new-command-result.ts";
import type { DriverClock } from "./process.ts";
import type { CliFailure } from "./run-list-query.ts";
import { jsonValue } from "./schema-check.ts";

interface Boundary {
  cwd: string;
  authPath?: string;
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
  clock: DriverClock;
  afterAuthImportDestinationLock?: (input: { temporary?: string }) => void | Promise<void>;
  afterAuthImportSourceLock?: (input: { temporary?: string }) => void | Promise<void>;
  beforeAuthImportRename?: (input: { temporary: string }) => void | Promise<void>;
  afterAuthImportResultPreflight?: (input: { maximumBytes: number }) => void | Promise<void>;
  afterAuthImportResultPrepared?: (input: { output: Buffer }) => void | Promise<void>;
}

interface Request { source: string; json: boolean }
interface Snapshot {
  dev: number;
  ino: number;
  uid: number;
  gid: number;
  mode: number;
  nlink: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}

const MESSAGES = {
  "value-missing": "Credential import requires one source file.",
  "value-oversized": "The credential import source path exceeds 4096 bytes.",
  "argument-extra": "Credential import accepts one source file.",
  "option-repeated": "Credential import accepts one JSON mode flag.",
  "option-unknown": "Credential import does not accept that option.",
  "source-missing": "The credential import source does not exist.",
  "source-is-destination": "The credential import source and destination are the same file.",
  "destination-not-empty": "Pi authentication already contains credentials; nothing was imported.",
  "source-invalid": "The credential import source is not a safe compatible credential file.",
  "destination-invalid": "The Pi authentication destination is not safe and empty.",
  "source-changed": "The credential import source changed during import.",
  "destination-changed": "The Pi authentication destination changed during import.",
  "temporary-changed": "The credential import temporary file changed during import.",
  "import-busy": "Credential import could not acquire its file locks.",
  "source-read-failed": "The credential import source could not be read safely.",
  "destination-read-failed": "The Pi authentication destination could not be read safely.",
  "import-write-failed": "Credential import could not publish Pi authentication.",
  "import-cleanup-failed": "Credential import stopped before publication and could not remove its temporary file.",
} as const;

type Cause = keyof typeof MESSAGES;

class ImportFailure extends Error {
  readonly failure: CliFailure;
  constructor(failureValue: CliFailure) { super(failureValue.message); this.failure = failureValue; }
}

function pathText(value: string): string {
  const raw = Buffer.from(plainly(value));
  let end = Math.min(raw.length, 512);
  while (end > 0 && (raw[end] ?? 0) >= 0x80 && (raw[end] ?? 0) < 0xc0) end -= 1;
  return raw.subarray(0, end).toString("utf8");
}

function failure(cause: Cause, path?: string): CliFailure {
  const request = ["value-missing", "value-oversized", "argument-extra", "option-repeated", "option-unknown",
    "source-missing", "source-is-destination", "destination-not-empty"].includes(cause);
  const integrity = cause === "source-invalid" || cause === "destination-invalid";
  return { code: request ? "request-invalid" : integrity ? "integrity-failed" : "dependency-failed", cause,
    message: MESSAGES[cause], retryable: !request && !integrity, details: path === undefined ? {} : { path: pathText(path) },
    exit: request ? 2 : integrity ? 5 : 4 };
}

function stop(cause: Cause, path?: string): never { throw new ImportFailure(failure(cause, path)); }

function emitFailure(boundary: Boundary, held: CliFailure, json: boolean): number {
  if (json) {
    boundary.stderr(`${jsonObject({ schemaVersion: 1, kind: "error", error: {
      code: held.code, operation: "auth.import", cause: held.cause, message: held.message,
      retryable: held.retryable, details: held.details,
    } })}\n`);
  } else {
    const path = typeof held.details["path"] === "string" ? held.details["path"] : undefined;
    const message = path === undefined ? held.message : `${held.message} Path: ${path}.`;
    boundary.stderr(`${inertText(message, AUTH_IMPORT_CONTRACT.humanErrorBytes - 1).text}\n`);
  }
  return held.exit;
}

function parse(args: readonly string[], cwd: string): Request | CliFailure {
  const jsonCount = args.filter((word) => word === "--json" || word === "-j").length;
  if (jsonCount > 1) return failure("option-repeated");
  const rest = args.filter((word) => word !== "--json" && word !== "-j");
  const option = rest.find((word) => word.startsWith("-"));
  if (option !== undefined) return failure("option-unknown");
  if (rest.length === 0) return failure("value-missing");
  if (rest.length > 1) return failure("argument-extra");
  const source = rest[0] ?? "";
  if (Buffer.byteLength(source) > AUTH_IMPORT_CONTRACT.sourceArgumentBytes) return failure("value-oversized");
  return { source: isAbsolute(source) ? resolve(source) : resolve(cwd, source), json: jsonCount === 1 };
}

function snapshot(stats: Stats): Snapshot {
  return { dev: stats.dev, ino: stats.ino, uid: stats.uid, gid: stats.gid, mode: stats.mode, nlink: stats.nlink,
    size: stats.size, mtimeMs: stats.mtimeMs, ctimeMs: stats.ctimeMs };
}

function sameSnapshot(first: Snapshot, second: Snapshot): boolean {
  return first.dev === second.dev && first.ino === second.ino && first.uid === second.uid && first.gid === second.gid
    && first.mode === second.mode && first.nlink === second.nlink && first.size === second.size
    && first.mtimeMs === second.mtimeMs && first.ctimeMs === second.ctimeMs;
}

function sameDirectory(first: Snapshot, second: Snapshot): boolean {
  return first.dev === second.dev && first.ino === second.ino && first.uid === second.uid && first.gid === second.gid
    && first.mode === second.mode;
}

async function named(path: string): Promise<Stats | undefined> {
  try { return await lstat(path); } catch (reason: unknown) {
    if (["ENOENT", "ENAMETOOLONG", "ENOTDIR"].includes(errorCode(reason) ?? "")) return undefined;
    throw reason;
  }
}

function user(): number | undefined { return typeof process.geteuid === "function" ? process.geteuid() : undefined; }
function mode(held: Snapshot): number { return held.mode & 0o777; }

function safeDirectory(stats: Stats): boolean {
  return stats.isDirectory() && !stats.isSymbolicLink() && user() !== undefined && stats.uid === user() && (stats.mode & 0o777) === 0o700;
}

function safeFile(stats: Stats): boolean {
  return stats.isFile() && !stats.isSymbolicLink() && user() !== undefined && stats.uid === user()
    && (stats.mode & 0o777) === 0o600 && stats.nlink === 1 && stats.size <= AUTH_IMPORT_CONTRACT.credentialFileBytesInclusive;
}

function sameInode(first: Snapshot, second: Snapshot): boolean { return first.dev === second.dev && first.ino === second.ino; }
function sameIdentity(first: Snapshot, second: Snapshot): boolean {
  return sameInode(first, second) && first.uid === second.uid && first.gid === second.gid
    && first.mode === second.mode && first.nlink === second.nlink;
}

function delay(clock: DriverClock, milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => { clock.setTimeout(resolveDelay, milliseconds); });
}

async function destinationLock(path: string, clock: DriverClock, compromised: { reason?: unknown }): Promise<() => Promise<void>> {
  const started = clock.milliseconds();
  let retry = 0;
  for (;;) {
    try {
      const release = await lock(path, { realpath: false, retries: 0, stale: AUTH_IMPORT_CONTRACT.destinationLockMilliseconds,
        onCompromised: (reason) => { compromised.reason = reason; } });
      return async () => { await release(); };
    } catch (reason: unknown) {
      const remaining = AUTH_IMPORT_CONTRACT.destinationLockMilliseconds - (clock.milliseconds() - started);
      if (errorCode(reason) !== "ELOCKED" || remaining <= 0) stop("import-busy");
      const base = Math.min(10 * (2 ** retry), 1_000), wait = Math.min(Math.round(base * (1 + Math.random())), remaining);
      retry += 1;
      await delay(clock, wait);
    }
  }
}

function lockCompromised(state: { reason?: unknown }): boolean { return state.reason !== undefined; }

async function sourceLock(path: string, clock: DriverClock): Promise<() => void> {
  for (let attempt = 0; ; attempt += 1) {
    try { return lockSync(path, { realpath: false }); } catch (reason: unknown) {
      if (errorCode(reason) !== "ELOCKED" || attempt >= 50) stop("import-busy");
      await delay(clock, 20);
    }
  }
}

function apiKeyCompatible(credential: Record<string, unknown>): boolean {
  const env = credential["env"];
  return credential["type"] === "api_key" && (credential["key"] === undefined || typeof credential["key"] === "string")
    && (env === undefined || (mapping(env) && Object.values(env).every((held) => typeof held === "string")));
}

function oauthCompatible(credential: Record<string, unknown>): boolean {
  return credential["type"] === "oauth" && typeof credential["refresh"] === "string"
    && typeof credential["access"] === "string" && typeof credential["expires"] === "number"
    && Number.isFinite(credential["expires"]);
}

function credentialCompatible(credential: unknown): boolean {
  return mapping(credential) && (apiKeyCompatible(credential) || oauthCompatible(credential));
}

function compatible(value: unknown): value is Record<string, unknown> {
  return mapping(value) && Object.values(value).every(credentialCompatible);
}

function credentials(bytes: Buffer, source: string): { count: number; bytes: Buffer } {
  const offset = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? 3 : 0;
  const parsed = jsonValue(bytes.subarray(offset));
  if ("error" in parsed) stop("source-invalid", source);
  const value = parsed.value;
  if (!compatible(value)) stop("source-invalid", source);
  return { count: Object.keys(value).length, bytes };
}

function emptyDestination(bytes: Buffer, destination: string): void {
  const offset = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? 3 : 0;
  const parsed = jsonValue(bytes.subarray(offset));
  if ("error" in parsed) stop("destination-invalid", destination);
  const value = parsed.value;
  if (!mapping(value)) stop("destination-invalid", destination);
  if (Object.keys(value).length > 0) stop("destination-not-empty", destination);
}

async function fileSnapshot(handle: FileHandle): Promise<Snapshot> { return snapshot(await handle.stat()); }

async function openHeld(path: string, expected: Snapshot, cause: "source-changed" | "destination-changed",
  readCause: "source-read-failed" | "destination-read-failed"): Promise<FileHandle> {
  try {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const held = await fileSnapshot(handle);
    if (!sameSnapshot(expected, held)) { await handle.close().catch(() => undefined); stop(cause, path); }
    return handle;
  } catch (reason: unknown) {
    if (reason instanceof ImportFailure) throw reason;
    stop(readCause, path);
  }
}

async function directoryHeld(path: string, expected: Snapshot, cause: "source-changed" | "destination-changed",
  readCause: "source-read-failed" | "destination-read-failed", detail: string): Promise<FileHandle> {
  try {
    const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    if (!sameDirectory(expected, await fileSnapshot(handle))) { await handle.close().catch(() => undefined); stop(cause, detail); }
    return handle;
  } catch (reason: unknown) {
    if (reason instanceof ImportFailure) throw reason;
    stop(readCause, detail);
  }
}

async function readHeld(handle: FileHandle, expected: Snapshot, path: string,
  changed: "source-changed" | "destination-changed", readCause: "source-read-failed" | "destination-read-failed"): Promise<Buffer> {
  try {
    const bytes = Buffer.alloc(expected.size);
    const reading = expected.size === 0 ? { bytesRead: 0 } : await handle.read(bytes, 0, expected.size, 0);
    if (reading.bytesRead !== expected.size || !sameSnapshot(expected, await fileSnapshot(handle))) stop(changed, path);
    return bytes;
  } catch (reason: unknown) {
    if (reason instanceof ImportFailure) throw reason;
    stop(readCause, path);
  }
}

async function unchanged(path: string, expected: Snapshot | undefined, cause: "source-changed" | "destination-changed" | "temporary-changed"): Promise<void> {
  let current: Stats | undefined;
  try { current = await named(path); } catch { stop(cause, path); }
  if ((expected === undefined) !== (current === undefined) || (expected !== undefined && current !== undefined && !sameSnapshot(expected, snapshot(current)))) stop(cause, path);
}

async function unchangedDirectory(path: string, expected: Snapshot, cause: "source-changed" | "destination-changed", detail: string): Promise<void> {
  let current: Stats | undefined;
  try { current = await named(path); } catch { stop(cause, detail); }
  if (current === undefined || !sameDirectory(expected, snapshot(current))) stop(cause, detail);
}

async function closeOr(handle: FileHandle | undefined, cause: "source-read-failed" | "destination-read-failed", path: string): Promise<void> {
  if (handle === undefined) return;
  try { await handle.close(); } catch { stop(cause, path); }
}

async function cleanup(path: string | undefined, expected: Snapshot | undefined): Promise<void> {
  if (path === undefined || expected === undefined) return;
  let current: Stats | undefined;
  try { current = await named(path); } catch { stop("import-cleanup-failed", path); }
  if (current === undefined || !sameIdentity(expected, snapshot(current))) return;
  try { await unlink(path); } catch { stop("import-cleanup-failed", path); }
}

interface Initial {
  sourceDir: string;
  agentDir: string;
  source: Snapshot;
  sourceDirSnapshot: Snapshot;
  destination?: Snapshot;
  agentDirSnapshot: Snapshot;
}

interface Session extends Initial {
  request: Request;
  destinationPath: string;
  boundary: Boundary;
  compromised: { reason?: unknown };
  releaseDestination?: () => Promise<void>;
  releaseSource?: () => void;
  sourceHandle: FileHandle | undefined;
  destinationHandle: FileHandle | undefined;
  sourceDirectory: FileHandle | undefined;
  destinationDirectory: FileHandle | undefined;
  temporaryHandle: FileHandle | undefined;
  temporary: string | undefined;
  temporarySnapshot: Snapshot | undefined;
  committed: boolean;
}

async function inspectSource(source: string, sourceDir: string): Promise<{ parent: Stats; leaf: Stats }> {
  try {
    const parent = await named(sourceDir), leaf = await named(source);
    if (leaf === undefined) stop("source-missing", source);
    if (parent === undefined || !safeDirectory(parent)) stop("source-invalid", source);
    return { parent, leaf };
  } catch (reason: unknown) {
    if (reason instanceof ImportFailure) throw reason;
    stop("source-invalid", source);
  }
}

async function inspectDestination(destination: string, agentDir: string): Promise<{ parent: Stats; leaf?: Stats }> {
  try {
    let parent = await named(agentDir);
    if (parent === undefined) {
      await mkdir(agentDir, { recursive: true, mode: 0o700 });
      parent = await lstat(agentDir);
    }
    const leaf = await named(destination);
    if (!safeDirectory(parent)) stop("destination-invalid", destination);
    return { parent, ...(leaf === undefined ? {} : { leaf }) };
  } catch (reason: unknown) {
    if (reason instanceof ImportFailure) throw reason;
    stop("destination-invalid", destination);
  }
}

async function inspect(request: Request, destination: string): Promise<Initial> {
  if (request.source === destination) stop("source-is-destination", request.source);
  const sourceDir = dirname(request.source), agentDir = dirname(destination);
  const source = await inspectSource(request.source, sourceDir), destinationState = await inspectDestination(destination, agentDir);
  const sourceSnapshot = snapshot(source.leaf), destinationSnapshot = destinationState.leaf === undefined ? undefined : snapshot(destinationState.leaf);
  if (destinationSnapshot !== undefined && sameInode(sourceSnapshot, destinationSnapshot)) stop("source-is-destination", request.source);
  if (!safeFile(source.leaf)) stop("source-invalid", request.source);
  if (destinationState.leaf !== undefined && !safeFile(destinationState.leaf)) stop("destination-invalid", destination);
  return { sourceDir, agentDir, source: sourceSnapshot, sourceDirSnapshot: snapshot(source.parent),
    ...(destinationSnapshot === undefined ? {} : { destination: destinationSnapshot }), agentDirSnapshot: snapshot(destinationState.parent) };
}

async function claim(session: Session): Promise<void> {
  session.releaseDestination = await destinationLock(session.destinationPath, session.boundary.clock, session.compromised);
  if (lockCompromised(session.compromised)) stop("import-busy");
  await session.boundary.afterAuthImportDestinationLock?.({});
  await unchanged(session.request.source, session.source, "source-changed");
  await unchanged(session.destinationPath, session.destination, "destination-changed");
  const destination = await named(session.destinationPath);
  if (destination !== undefined && sameInode(session.source, snapshot(destination))) stop("source-is-destination", session.request.source);
  session.releaseSource = await sourceLock(session.request.source, session.boundary.clock);
  await session.boundary.afterAuthImportSourceLock?.({});
}

async function readStores(session: Session): Promise<{ count: number; bytes: Buffer }> {
  session.sourceDirectory = await directoryHeld(session.sourceDir, session.sourceDirSnapshot,
    "source-changed", "source-read-failed", session.request.source);
  session.destinationDirectory = await directoryHeld(session.agentDir, session.agentDirSnapshot,
    "destination-changed", "destination-read-failed", session.destinationPath);
  await unchanged(session.destinationPath, session.destination, "destination-changed");
  await unchanged(session.request.source, session.source, "source-changed");
  if (session.destination !== undefined) {
    session.destinationHandle = await openHeld(session.destinationPath, session.destination,
      "destination-changed", "destination-read-failed");
    emptyDestination(await readHeld(session.destinationHandle, session.destination, session.destinationPath,
      "destination-changed", "destination-read-failed"), session.destinationPath);
  }
  session.sourceHandle = await openHeld(session.request.source, session.source, "source-changed", "source-read-failed");
  return credentials(await readHeld(session.sourceHandle, session.source, session.request.source,
    "source-changed", "source-read-failed"), session.request.source);
}

async function closeEmpty(session: Session): Promise<void> {
  await closeOr(session.sourceHandle, "source-read-failed", session.request.source); session.sourceHandle = undefined;
  await closeOr(session.destinationHandle, "destination-read-failed", session.destinationPath); session.destinationHandle = undefined;
  await closeOr(session.sourceDirectory, "source-read-failed", session.request.source); session.sourceDirectory = undefined;
  await closeOr(session.destinationDirectory, "destination-read-failed", session.destinationPath); session.destinationDirectory = undefined;
}

async function prepareTemporary(session: Session, bytes: Buffer): Promise<void> {
  session.temporary = join(session.agentDir, `.bot-auth-import-${randomUUID()}`);
  try {
    session.temporaryHandle = await open(session.temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    session.temporarySnapshot = await fileSnapshot(session.temporaryHandle);
    await session.temporaryHandle.writeFile(bytes);
    await session.temporaryHandle.sync();
    session.temporarySnapshot = await fileSnapshot(session.temporaryHandle);
    if (mode(session.temporarySnapshot) !== 0o600 || session.temporarySnapshot.nlink !== 1
      || session.temporarySnapshot.uid !== user() || session.temporarySnapshot.size !== bytes.length) {
      stop("temporary-changed", session.temporary);
    }
    await session.temporaryHandle.close(); session.temporaryHandle = undefined;
  } catch (reason: unknown) {
    if (reason instanceof ImportFailure) throw reason;
    stop("import-write-failed");
  }
}

function publicationState(session: Session): {
  temporary: string;
  temporarySnapshot: Snapshot;
  sourceDirectory: FileHandle;
  destinationDirectory: FileHandle;
  sourceHandle: FileHandle;
} | undefined {
  if (session.temporary === undefined || session.temporarySnapshot === undefined || session.sourceDirectory === undefined
    || session.destinationDirectory === undefined || session.sourceHandle === undefined) return undefined;
  return { temporary: session.temporary, temporarySnapshot: session.temporarySnapshot,
    sourceDirectory: session.sourceDirectory, destinationDirectory: session.destinationDirectory,
    sourceHandle: session.sourceHandle };
}

async function verifyPublication(session: Session, sourceBytes: Buffer): Promise<void> {
  const state = publicationState(session);
  if (state === undefined) stop("import-write-failed");
  const { temporary, temporarySnapshot, sourceDirectory, destinationDirectory, sourceHandle } = state;
  await closeOr(session.destinationHandle, "destination-read-failed", session.destinationPath); session.destinationHandle = undefined;
  await session.boundary.beforeAuthImportRename?.({ temporary });
  if (lockCompromised(session.compromised)) stop("import-busy");
  await unchanged(session.request.source, session.source, "source-changed");
  await unchanged(session.destinationPath, session.destination, "destination-changed");
  await unchanged(temporary, temporarySnapshot, "temporary-changed");
  await unchangedDirectory(session.sourceDir, session.sourceDirSnapshot, "source-changed", session.request.source);
  await unchangedDirectory(session.agentDir, session.agentDirSnapshot, "destination-changed", session.destinationPath);
  const finalSourceDirectory = await fileSnapshot(sourceDirectory), finalDestinationDirectory = await fileSnapshot(destinationDirectory);
  if (!sameDirectory(session.agentDirSnapshot, finalDestinationDirectory)) stop("destination-changed", session.destinationPath);
  if (!sameDirectory(session.sourceDirSnapshot, finalSourceDirectory)) stop("source-changed", session.request.source);
  if (!sourceBytes.equals(await readHeld(sourceHandle, session.source, session.request.source, "source-changed", "source-read-failed"))) {
    stop("source-changed", session.request.source);
  }
}

async function publish(session: Session, sourceBytes: Buffer): Promise<void> {
  await verifyPublication(session, sourceBytes);
  try { await rename(session.temporary ?? "", session.destinationPath); session.committed = true; } catch { stop("import-write-failed"); }
  try { await session.destinationDirectory?.sync(); } catch { /* Publication already committed. */ }
}

async function cleanFailure(session: Session, reason: unknown): Promise<void> {
  if (session.temporary === undefined) return;
  if (session.temporaryHandle !== undefined) {
    try { await session.temporaryHandle.close(); } catch { /* Cleanup still uses identity. */ }
    session.temporaryHandle = undefined;
  }
  try {
    if (reason instanceof ImportFailure && reason.failure.cause === "import-write-failed") {
      await session.boundary.beforeAuthImportRename?.({ temporary: session.temporary });
    }
    const observed = session.temporarySnapshot ?? (await named(session.temporary).then((held) => held === undefined ? undefined : snapshot(held)));
    await cleanup(session.temporary, observed);
  } catch (cleanupReason: unknown) {
    if (cleanupReason instanceof ImportFailure) throw cleanupReason;
    stop("import-cleanup-failed", session.temporary);
  }
}

async function closeSettled(handle: FileHandle, cause: "source-read-failed" | "destination-read-failed",
  path: string, committed: boolean): Promise<ImportFailure | undefined> {
  try { await handle.close(); return undefined; } catch {
    return committed ? undefined : new ImportFailure(failure(cause, path));
  }
}

function ensureUncompromisedSettlement(session: Session): void {
  if (!session.committed && lockCompromised(session.compromised)) stop("import-busy");
}

async function settle(session: Session): Promise<void> {
  let closeFailure: ImportFailure | undefined;
  for (const [handle, cause, path] of [[session.sourceHandle, "source-read-failed", session.request.source],
    [session.destinationHandle, "destination-read-failed", session.destinationPath],
    [session.sourceDirectory, "source-read-failed", session.request.source],
    [session.destinationDirectory, "destination-read-failed", session.destinationPath]] as const) {
    if (handle !== undefined) {
      const failed = await closeSettled(handle, cause, path, session.committed);
      closeFailure ??= failed;
    }
  }
  try { session.releaseSource?.(); } catch { /* A settled result remains truthful. */ }
  try { await session.releaseDestination?.(); } catch { /* A settled result remains truthful. */ }
  ensureUncompromisedSettlement(session);
  if (closeFailure !== undefined) throw closeFailure;
}

function resultOutput(request: Request, count: number): Buffer {
  const output = request.json
    ? `${jsonObject({ schemaVersion: 1, kind: "bot.auth.import", data: { imported: count > 0, providerCount: count } })}\n`
    : count > 0 ? `Imported ${String(count)} provider credentials into Pi authentication.\n`
      : "No provider credentials were present to import.\n";
  return Buffer.from(output);
}

async function execute(request: Request, destination: string, boundary: Boundary): Promise<{ count: number; output: Buffer }> {
  const initial = await inspect(request, destination);
  const session: Session = { ...initial, request, destinationPath: destination, boundary, compromised: {}, committed: false,
    sourceHandle: undefined, destinationHandle: undefined, sourceDirectory: undefined, destinationDirectory: undefined,
    temporaryHandle: undefined, temporary: undefined, temporarySnapshot: undefined };

  try {
    await claim(session);
    const parsed = await readStores(session);
    const output = resultOutput(request, parsed.count);
    if (output.length > AUTH_IMPORT_CONTRACT.resultBytes) stop("source-invalid", request.source);
    await boundary.afterAuthImportResultPrepared?.({ output });
    if (parsed.count === 0) {
      await closeEmpty(session);
      return { count: 0, output };
    }
    await prepareTemporary(session, parsed.bytes);
    await publish(session, parsed.bytes);
    return { count: parsed.count, output };
  } catch (reason: unknown) {
    const settlement = !session.committed && lockCompromised(session.compromised)
      ? new ImportFailure(failure("import-busy")) : reason;
    await cleanFailure(session, settlement);
    throw settlement;
  } finally {
    await settle(session);
  }
}

export async function authImportCommand(args: readonly string[], boundary: Boundary): Promise<number> {
  const request = parse(args, boundary.cwd);
  const requestedJson = args.some((word) => word === "--json" || word === "-j");
  if ("code" in request) return emitFailure(boundary, request, requestedJson);
  const destination = boundary.authPath ?? resolve(boundary.cwd, "auth.json");
  try {
    const maximumBytes = resultOutput(request, AUTH_IMPORT_CONTRACT.credentialFileBytesInclusive).length;
    await boundary.afterAuthImportResultPreflight?.({ maximumBytes });
    if (maximumBytes > AUTH_IMPORT_CONTRACT.resultBytes) return emitFailure(boundary, failure("source-invalid", request.source), request.json);
    const result = await execute(request, destination, boundary);
    boundary.stdout(result.output);
    return result.count > 0 ? 0 : 1;
  } catch (reason: unknown) {
    return emitFailure(boundary, reason instanceof ImportFailure ? reason.failure : failure("import-write-failed"), request.json);
  }
}
