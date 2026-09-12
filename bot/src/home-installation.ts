import { isUtf8 } from "node:buffer";
import { randomBytes, randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { link, lstat, mkdir, open, realpath, unlink, type FileHandle } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { jsonObject } from "./check.ts";
import { errorCode } from "./model.ts";
import { jsonValue } from "./schema-check.ts";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export class HomeInstallationError extends Error {
  readonly exit: 3 | 4 | 5;
  readonly causeCode: string;
  readonly published: boolean;
  constructor(message: string, causeCode = "installation-invalid", exit: 3 | 4 | 5 = 5, published = false, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.exit = exit;
    this.causeCode = causeCode;
    this.published = published;
  }
}

export interface InstallationDependencies {
  syncParent?: (parent: FileHandle) => Promise<void>;
  syncFile?: (file: FileHandle) => Promise<void>;
  link?: (source: string, destination: string) => Promise<void>;
  removeTemporary?: (path: string) => Promise<void>;
  syncHome?: (home: FileHandle) => Promise<void>;
  closeHome?: (home: FileHandle) => Promise<void>;
  createHome?: (entry: string) => Promise<void>;
  afterHomeObservation?: (path: string) => Promise<void>;
  afterRecordObservation?: (path: string) => Promise<void>;
  requireFeasible?: (installationId: string) => void;
  interrupt?: (phase: "before-link" | "after-link" | "before-temporary-remove" | "before-home-sync") => Promise<void>;
}

interface HeldHome { parent: HeldDirectory; directory: FileHandle; entryPath: string; expected: BigIntStats }
interface HeldDirectory { handle: FileHandle; path: string; expected: BigIntStats }

export type InstallationReading = { initialized: false } | { initialized: true; installationId: string };

function failure(message: string, causeCode = "installation-invalid", cause?: unknown): HomeInstallationError {
  return new HomeInstallationError(message, causeCode, 5, false, cause); }

function effectiveUser(): number {
  if (typeof process.geteuid !== "function") throw failure("This platform cannot verify installation ownership.", "ownership-unavailable");
  return process.geteuid(); }

function privateDirectory(stat: BigIntStats): boolean {
  return stat.isDirectory() && Number(stat.uid) === effectiveUser() && (Number(stat.mode) & 0o7777) === 0o700; }

function sameObject(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino; }

function sameSnapshot(left: BigIntStats, right: BigIntStats): boolean {
  return sameObject(left, right) && left.size === right.size && left.mode === right.mode && left.uid === right.uid
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function exactObject(value: unknown, keys: readonly string[]): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}

async function closeHeld(home: HeldHome, dependencies: InstallationDependencies = {}): Promise<unknown[]> {
  const failures: unknown[] = [];
  await (dependencies.closeHome ?? ((directory) => directory.close()))(home.directory)
    .then(() => undefined, (reason: unknown) => { failures.push(reason); });
  await home.parent.handle.close().then(() => undefined, (reason: unknown) => { failures.push(reason); });
  return failures;
}

async function openParent(path: string): Promise<HeldDirectory> {
  const canonical = await realpath(path);
  const named = await lstat(canonical, { bigint: true });
  if (named.isSymbolicLink() || !named.isDirectory()) throw failure("The Bot home parent is not a real directory.", "parent-insecure");
  const handle = await open(canonical, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const expected = await handle.stat({ bigint: true });
  if (!sameObject(named, expected) || !expected.isDirectory()) {
    await handle.close();
    throw failure("The Bot home parent changed while it was opened.", "parent-changed");
  }
  return { handle, path: canonical, expected };
}

async function stableParent(parent: HeldDirectory): Promise<boolean> {
  const observed = await Promise.all([parent.handle.stat({ bigint: true }), lstat(parent.path, { bigint: true })])
    .then((value) => value, () => undefined);
  if (observed === undefined) return false;
  const [held, named] = observed;
  return !named.isSymbolicLink() && named.isDirectory()
    && sameObject(held, parent.expected) && sameObject(named, parent.expected);
}

async function observePath(path: string, after?: (path: string) => Promise<void>): Promise<BigIntStats | undefined> {
  const named = await lstat(path, { bigint: true }).then((value) => value, (reason: unknown) => {
    if (errorCode(reason) === "ENOENT") return undefined;
    throw reason;
  });
  await after?.(path);
  return named;
}

async function ensureHome(entryPath: string, create: boolean, dependencies: InstallationDependencies): Promise<BigIntStats | undefined> {
  const observed = await observePath(entryPath, dependencies.afterHomeObservation);
  if (observed !== undefined || !create) return observed;
  await (dependencies.createHome ?? ((entry) => mkdir(entry, { mode: 0o700 })))(entryPath)
    .catch((reason: unknown) => { if (errorCode(reason) !== "EEXIST") throw reason; });
  return lstat(entryPath, { bigint: true });
}

async function openHome(path: string, create: boolean, dependencies: InstallationDependencies): Promise<HeldHome | undefined> {
  const absolute = resolve(path), parentPath = dirname(absolute), name = basename(absolute);
  const parent = await openParent(parentPath).catch((reason: unknown) => {
    const missing = errorCode(reason) === "ENOENT" || errorCode(reason) === "ENOTDIR";
    if (missing && !create) return undefined;
    throw new HomeInstallationError(missing ? "The Bot home parent does not exist." : "The Bot home parent cannot be held safely.",
      missing ? "parent-missing" : "parent-unreadable", missing ? 3 : 5, false, reason);
  });
  if (parent === undefined) return undefined;
  const entryPath = join(parent.path, name);
  const opened = Promise.resolve().then(async () => {
    if (create) dependencies.requireFeasible?.("018f2f4a-52f8-4c81-9b35-6ad2acdb70d8");
    const named = await ensureHome(entryPath, create, dependencies);
    if (!await stableParent(parent)) throw failure("The Bot home parent changed while it was held.", "parent-changed");
    if (named === undefined) return undefined;
    if (named.isSymbolicLink() || !privateDirectory(named)) throw failure("The Bot home is not a private owner-only directory.", "home-insecure");
    const directory = await open(entryPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
      .catch((reason: unknown): never => { throw failure("The Bot home changed while it was opened.", "home-changed", reason); });
    const observed = await directory.stat({ bigint: true });
    const home = { parent, directory, entryPath, expected: observed };
    if (!sameObject(named, observed) || !privateDirectory(observed) || !await stableParent(parent)) {
      await directory.close();
      throw failure("The Bot home changed while it was opened.", "home-changed");
    }
    return home;
  });
  return opened.then(async (home) => {
    if (home === undefined) await parent.handle.close();
    return home;
  }, async (reason: unknown): Promise<never> => {
    await parent.handle.close();
    throw reason;
  });
}

async function stableHome(home: HeldHome): Promise<boolean> {
  const [held, named, parent] = await Promise.all([
    home.directory.stat({ bigint: true }), lstat(home.entryPath, { bigint: true }), stableParent(home.parent),
  ]);
  return parent && sameObject(held, home.expected) && sameObject(named, home.expected)
    && !named.isSymbolicLink() && privateDirectory(held) && privateDirectory(named);
}

async function exactRead(descriptor: FileHandle, size: number): Promise<Buffer> {
  const bytes = Buffer.alloc(size);
  let position = 0;
  while (position < size) {
    const read = await descriptor.read(bytes, position, size - position, position);
    if (read.bytesRead === 0) throw failure("The installation record changed during its read.", "record-changed");
    position += read.bytesRead;
  }
  return bytes;
}

function parseRecord(bytes: Buffer): string {
  if (!isUtf8(bytes)) throw failure("The installation record is not valid UTF-8.", "record-encoding");
  const source = bytes.toString("utf8");
  if (!source.endsWith("}\n") || source.startsWith("\uFEFF")) {
    throw failure("The installation record does not have its required newline-terminated form.", "record-shape");
  }
  const parsed = jsonValue(Buffer.from(source.slice(0, -1)));
  if ("error" in parsed) throw failure("The installation record is malformed.", "record-shape");
  const duplicateCheck = parseDocument(source.slice(0, -1), { uniqueKeys: true });
  if (duplicateCheck.errors.length > 0) throw failure("The installation record contains a duplicate field.", "record-shape");
  const id = installationIdentity(parsed.value);
  if (id === undefined) throw failure("The installation record has the wrong shape or identity.", "record-shape");
  return id;
}

function installationIdentity(value: unknown): string | undefined {
  if (!exactObject(value, ["schemaVersion", "kind", "data"])) return undefined;
  if (Reflect.get(value, "schemaVersion") !== 1) return undefined;
  if (Reflect.get(value, "kind") !== "bot.installation") return undefined;
  const data: unknown = Reflect.get(value, "data");
  if (!exactObject(data, ["id"])) return undefined;
  const id: unknown = Reflect.get(data, "id");
  if (typeof id !== "string") return undefined;
  return UUID_V4.test(id) ? id : undefined;
}

function secureRecord(stat: BigIntStats): boolean {
  return !stat.isSymbolicLink() && stat.isFile() && Number(stat.uid) === effectiveUser()
    && (Number(stat.mode) & 0o7777) === 0o600 && stat.size <= 1_024n;
}

async function openRecord(path: string): Promise<FileHandle> {
  return open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    .catch((reason: unknown): never => { const changed = errorCode(reason) === "ENOENT";
      throw failure(changed ? "The installation record changed while it was opened." : "The installation record cannot be opened safely.",
        changed ? "record-changed" : "record-unreadable", reason); });
}

async function stableRecord(home: HeldHome, initial: BigIntStats, after: BigIntStats, named: BigIntStats): Promise<boolean> {
  return sameSnapshot(initial, after) && sameSnapshot(initial, named) && await stableHome(home); }

async function readHeld(home: HeldHome, dependencies: InstallationDependencies = {}): Promise<InstallationReading> {
  if (!await stableHome(home)) throw failure("The Bot home changed during installation reading.", "home-changed");
  const path = join(home.entryPath, "installation.json");
  const named = await observePath(path, dependencies.afterRecordObservation);
  if (named === undefined) {
    if (!await stableHome(home)) throw failure("The Bot home changed during installation reading.", "home-changed");
    return { initialized: false };
  }
  if (!secureRecord(named)) {
    throw failure("The installation record is not a private bounded regular file.", "record-insecure");
  }
  const descriptor = await openRecord(path);
  try {
    const observed = await descriptor.stat({ bigint: true });
    if (!sameObject(named, observed) || !secureRecord(observed)) {
      throw failure("The installation record changed while it was opened.", "record-changed");
    }
    const bytes = await exactRead(descriptor, Number(observed.size));
    const [after, finalNamed] = await Promise.all([descriptor.stat({ bigint: true }), lstat(path, { bigint: true })])
      .catch((reason: unknown): never => { throw failure("The installation record changed during its read.", "record-changed", reason); });
    if (!await stableRecord(home, observed, after, finalNamed)) throw failure("The installation record changed during its read.", "record-changed");
    const installationId = parseRecord(bytes);
    dependencies.requireFeasible?.(installationId);
    return { initialized: true, installationId };
  } finally {
    await descriptor.close();
  }
}

export async function readInstallation(path: string, dependencies: InstallationDependencies = {}): Promise<InstallationReading> {
  const home = await openHome(path, false, dependencies).catch((reason: unknown) => {
    throw reason instanceof HomeInstallationError ? reason : failure("The Bot home cannot be read safely.", "home-unreadable", reason);
  });
  if (home === undefined) return { initialized: false };
  const outcome = await readHeld(home, dependencies).then((value) => ({ value }), (reason: unknown) => ({ reason }));
  const closing = await closeHeld(home, dependencies);
  if ("reason" in outcome) throw outcome.reason;
  if (closing[0] !== undefined) throw failure("The held Bot home could not be closed safely.", "close-failed", closing[0]);
  return outcome.value;
}

async function finalizeCandidate(home: HeldHome, temporary: string, linked: boolean, dependencies: InstallationDependencies): Promise<unknown[]> {
  const failures: unknown[] = [];
  const removalInterrupted = await settleInterrupt(dependencies, "before-temporary-remove", failures);
  if (!removalInterrupted) await settleAction(() => (dependencies.removeTemporary ?? unlink)(temporary), failures);
  const syncInterrupted = await settleInterrupt(dependencies, "before-home-sync", failures);
  if (!syncInterrupted) await settleAction(() => (dependencies.syncHome ?? ((directory) => directory.sync()))(home.directory), failures);
  if (failures.length > 0 && linked) failures.unshift(new Error("Installation publication may have completed."));
  return failures;
}

async function settleInterrupt(
  dependencies: InstallationDependencies, phase: "before-temporary-remove" | "before-home-sync", failures: unknown[],
): Promise<boolean> {
  const interrupt = dependencies.interrupt;
  if (interrupt === undefined) return false;
  return interrupt(phase).then(() => false, (reason: unknown) => { failures.push(reason); return true; });
}

async function settleAction(action: () => Promise<void>, failures: unknown[]): Promise<void> {
  await action().then(() => undefined, (reason: unknown) => { failures.push(reason); });
}

async function completeCandidate(
  home: HeldHome, candidate: FileHandle, temporary: string, id: string, dependencies: InstallationDependencies,
): Promise<void> {
  const bytes = Buffer.from(`${jsonObject({ schemaVersion: 1, kind: "bot.installation", data: { id } })}\n`);
  const completion = await candidate.writeFile(bytes)
    .then(() => (dependencies.syncFile ?? ((file: FileHandle) => file.sync()))(candidate))
    .then(() => candidate.close())
    .then(() => ({ completed: true as const }), async (reason: unknown) => {
      const closeFailure = await candidate.close().then(() => undefined, (failed: unknown) => failed);
      return { completed: false as const, reason: closeFailure ?? reason };
    });
  if (completion.completed) return;
  const finalized = await finalizeCandidate(home, temporary, false, dependencies);
  if (finalized[0] !== undefined) throw failure("The installation candidate could not be finalized safely.", "candidate-finalization-failed", finalized[0]);
  throw new HomeInstallationError("The installation candidate could not be completed.", "candidate-failed", 4, false, completion.reason);
}

async function publishCandidate(
  temporary: string, destination: string, dependencies: InstallationDependencies,
): Promise<{ linked: boolean; operationFailure?: unknown }> {
  let linked = false;
  const interruption = await dependencies.interrupt?.("before-link").then(() => undefined, (reason: unknown) => reason);
  if (interruption !== undefined) return { linked, operationFailure: interruption };
  const publication = (dependencies.link ?? link)(temporary, destination)
    .then(() => { linked = true; return dependencies.interrupt?.("after-link"); });
  const operationFailure = await publication.then(() => undefined, (reason: unknown) => reason);
  if (errorCode(operationFailure) === "EEXIST") return { linked };
  return operationFailure === undefined ? { linked } : { linked, operationFailure };
}

function publicationError(linked: boolean, operationFailure: unknown, finalizationFailure: unknown): HomeInstallationError | undefined {
  const reason = finalizationFailure ?? operationFailure;
  if (reason === undefined) return undefined;
  const integrity = linked || finalizationFailure !== undefined;
  return new HomeInstallationError(linked
    ? "Installation publication may have completed, but finalization failed."
    : "Installation publication failed before Bot published a winner.",
  "publication-failed", integrity ? 5 : 4, linked, reason);
}

async function initializeHeld(
  home: HeldHome, dependencies: InstallationDependencies, publication: { mayHaveCompleted: boolean },
): Promise<Extract<InstallationReading, { initialized: true }>> {
  const existing = await readHeld(home, dependencies);
  if (existing.initialized) return existing;
  await (dependencies.syncParent ?? ((parent) => parent.sync()))(home.parent.handle)
    .catch((reason: unknown): never => { throw failure("The Bot home parent could not be synchronized before identity publication.", "parent-sync-failed", reason); });
  if (!await stableHome(home)) throw failure("The Bot home changed before identity publication.", "home-changed");
  const id = randomUUID();
  const temporary = join(home.entryPath, `.bot-installation-${randomBytes(16).toString("hex")}.tmp`);
  const destination = join(home.entryPath, "installation.json");
  const candidate = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    .then((opened) => opened, (reason: unknown): never => { throw new HomeInstallationError("The installation candidate could not be created.", "candidate-create-failed", 4, false, reason); });
  await completeCandidate(home, candidate, temporary, id, dependencies);
  const attempt = await publishCandidate(temporary, destination, dependencies);
  publication.mayHaveCompleted = attempt.linked;
  const finalized = await finalizeCandidate(home, temporary, attempt.linked, dependencies);
  const failed = publicationError(attempt.linked, attempt.operationFailure, finalized[0]);
  if (failed !== undefined) throw failed;
  const winner = await readHeld(home, dependencies);
  if (!winner.initialized) throw failure("Installation publication produced no readable winner.", "publication-missing");
  return winner;
}

function preservePublication(reason: unknown, published: boolean): HomeInstallationError {
  if (reason instanceof HomeInstallationError && (reason.published || !published)) return reason;
  if (reason instanceof HomeInstallationError) return new HomeInstallationError(reason.message, reason.causeCode, 5, true, reason);
  return new HomeInstallationError(published ? "Installation publication may have completed, but Bot could not finish safely." :
    "Installation did not complete safely.", "publication-failed", 5, published, reason);
}

function closeFailure(published: boolean, cause: unknown): HomeInstallationError {
  return new HomeInstallationError(published ? "Installation publication may have completed, but the held home could not be closed safely."
    : "The held Bot home could not be closed safely.", "close-failed", 5, published, cause); }

export async function initializeInstallation(path: string, dependencies: InstallationDependencies = {}): Promise<Extract<InstallationReading, { initialized: true }>> {
  const home = await openHome(path, true, dependencies).catch((reason: unknown) => {
    throw reason instanceof HomeInstallationError ? reason : failure("The Bot home could not be initialized safely.", "home-create-failed", reason);
  });
  if (home === undefined) throw failure("The Bot home could not be opened after creation.", "home-create-failed");
  const publication = { mayHaveCompleted: false };
  const outcome = await initializeHeld(home, dependencies, publication).then((value) => ({ value }), (reason: unknown) => ({ reason }));
  const closing = await closeHeld(home, dependencies);
  if (closing[0] !== undefined) throw closeFailure(publication.mayHaveCompleted, closing[0]);
  if ("reason" in outcome) throw preservePublication(outcome.reason, publication.mayHaveCompleted);
  return outcome.value;
}
