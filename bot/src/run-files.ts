// A run record names files below its own directory. This boundary holds the
// validated file object through the read, so a path replacement cannot turn a
// record-controlled read into a read of another object.
import { constants, type Dir, type Dirent, type Stats } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, open, opendir, stat, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { Readable, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { bytewise, errorCode, visible } from "./model.ts";
import { streamRecordLines } from "./record-line-stream.ts";
import { hashBytes } from "./record.ts";

const INSPECTION_MAX_BYTES = 1024 * 1024;
const INSPECTION_MAX_DEPTH = 32, INSPECTION_MAX_ENTRIES = 1_000;

export type HeldRunFile =
  | { kind: "missing" }
  | { kind: "dangling-link" }
  | { kind: "unreadable"; error?: unknown }
  | { kind: "non-file" }
  | { kind: "too-large" }
  | { kind: "held"; bytes: Buffer; mtime: number; size: number };

type PathFault = Exclude<HeldRunFile, { kind: "held" } | { kind: "too-large" }>;

export type CopiedRunFile =
  | { kind: "copied"; size: number; sha256?: string }
  | Exclude<HeldRunFile, { kind: "held" } | { kind: "too-large" }>
  | { kind: "interrupted"; phase: "read" | "write" | "close"; error?: unknown };

export interface HeldRunSource {
  size: number;
  sha256: string;
  copy(destination: () => Writable): Promise<CopiedRunFile>;
  close(): Promise<void>;
}

const unreadable = (error?: unknown): Extract<PathFault, { kind: "unreadable" }> =>
  error === undefined ? { kind: "unreadable" } : { kind: "unreadable", error };

const interrupted = (
  phase: "read" | "write" | "close", error?: unknown,
): Extract<CopiedRunFile, { kind: "interrupted" }> =>
  error === undefined ? { kind: "interrupted", phase } : { kind: "interrupted", phase, error };

async function named(path: string): Promise<Stats | PathFault> {
  return lstat(path).then(
    (held) => held,
    (error: unknown) => errorCode(error) === "ENOENT" ? { kind: "missing" } : unreadable(error),
  );
}

// A link at a record-controlled name is never opened. `stat` only asks whether
// its target exists, preserving record.jsonl's established dangling-link answer.
async function linked(path: string): Promise<PathFault> {
  return stat(path).then(
    () => unreadable(),
    (error: unknown) => errorCode(error) === "ENOENT" ? { kind: "dangling-link" } : unreadable(error),
  );
}

async function unchanged(checked: [string, Stats][]): Promise<boolean> {
  for (const [name, expected] of checked) {
    const held = await named(name);
    if (!("isFile" in held) || held.isSymbolicLink() || held.dev !== expected.dev || held.ino !== expected.ino) return false;
  }
  return true;
}

async function rootDirectory(directory: string): Promise<Stats | PathFault> {
  const root = await named(directory);
  if (!("isFile" in root)) return root;
  if (root.isSymbolicLink()) return unreadable();
  return root.isDirectory() ? root : { kind: "non-file" };
}

interface Walked {
  file: string;
  leaf: Stats;
  checked: [string, Stats][];
}

async function walk(directory: string, parts: string[]): Promise<Walked | PathFault> {
  const root = await rootDirectory(directory);
  if (!("isFile" in root)) return root;
  const checked: [string, Stats][] = [[directory, root]];
  let current = directory;
  let leaf: Stats | undefined;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const held = await named(current);
    if (!("isFile" in held)) return held;
    if (held.isSymbolicLink()) return index === parts.length - 1 ? linked(current) : unreadable();
    checked.push([current, held]);
    if (index === parts.length - 1) {
      leaf = held;
    } else if (!held.isDirectory()) {
      return { kind: "non-file" };
    }
  }
  return leaf === undefined || !leaf.isFile() ? { kind: "non-file" } : { file: current, leaf, checked };
}

async function readExact(descriptor: FileHandle, size: number): Promise<Buffer | undefined> {
  const bytes = Buffer.alloc(size);
  let position = 0;
  while (position < size) {
    const read = await descriptor.read(bytes, position, size - position, position);
    if (read.bytesRead === 0) return undefined;
    position += read.bytesRead;
  }
  return bytes;
}

async function copyExact(
  descriptor: FileHandle, size: number, destination: () => Writable,
): Promise<CopiedRunFile> {
  const opened = await Promise.resolve().then(destination).then(
    (output) => ({ kind: "opened" as const, output }),
    (error: unknown) => ({ kind: "failed" as const, error }),
  );
  if (opened.kind === "failed") return interrupted("write", opened.error);
  const fileSource = size === 0 ? undefined : descriptor.createReadStream({ start: 0, end: size - 1, autoClose: false });
  const source = fileSource ?? Readable.from([]);
  const output = opened.output, digest = createHash("sha256");
  let origin: { phase: "read" | "write"; error: unknown } | undefined;
  source.on("data", (chunk: Buffer) => digest.update(chunk));
  source.once("error", (error: unknown) => { origin ??= { phase: "read", error }; });
  output.once("error", (error: unknown) => { origin ??= { phase: "write", error }; });
  const failed = await pipeline(source, output).then(
    () => undefined,
    (error: unknown) => error,
  );
  if (failed !== undefined) {
    const failure = origin ?? { phase: "write", error: failed };
    if (failure.phase === "write" && errorCode(failure.error) === "EPIPE") return { kind: "copied", size };
    return interrupted(failure.phase, failure.error);
  }
  if (fileSource !== undefined && fileSource.bytesRead !== size) return interrupted("read");
  return { kind: "copied", size, sha256: digest.digest("hex") };
}

async function hashExact(descriptor: FileHandle, size: number, afterFirstChunk?: () => Promise<void>): Promise<string | undefined> {
  const digest = createHash("sha256"), chunk = Buffer.alloc(Math.min(64 * 1024, Math.max(size, 1)));
  let position = 0, first = true;
  while (position < size) {
    const read = await descriptor.read(chunk, 0, Math.min(chunk.length, size - position), position);
    if (read.bytesRead === 0) return undefined;
    digest.update(chunk.subarray(0, read.bytesRead));
    position += read.bytesRead;
    if (first) { first = false; await afterFirstChunk?.(); }
  }
  return digest.digest("hex");
}

/** Hold one safely opened file and its initial byte snapshot for a later streamed copy. */
export async function holdRunFile(directory: string, path: string, afterFirstChunk?: () => Promise<void>): Promise<HeldRunSource | PathFault> {
  const parts = path.split("/");
  const file = join(directory, ...parts);
  if (!file.startsWith(`${directory}/`)) return { kind: "missing" };
  const walked = await walk(directory, parts);
  if (!("file" in walked)) return walked;
  if (!await unchanged(walked.checked) || (walked.leaf.mode & 0o444) === 0) return unreadable();
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  return open(file, flags).then(async (descriptor): Promise<HeldRunSource | PathFault> => {
    const prepared = await descriptor.stat().then(async (observed) => {
      if (!observed.isFile() || observed.dev !== walked.leaf.dev || observed.ino !== walked.leaf.ino) return undefined;
      const sha256 = await hashExact(descriptor, observed.size, afterFirstChunk);
      return sha256 === undefined ? undefined : { observed, sha256 };
    }).catch(() => undefined);
    if (prepared === undefined) return descriptor.close().then(() => unreadable(), (error: unknown) => unreadable(error));
    const { observed, sha256 } = prepared;
    let closed = false;
    const close = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await descriptor.close();
    };
    return {
      size: observed.size,
      sha256,
      copy: async (destination) => {
        const copied = await copyExact(descriptor, observed.size, destination);
        return close().then(
          () => copied,
          (error: unknown) => copied.kind === "interrupted" ? copied : interrupted("close", error),
        );
      },
      close,
    };
  }, (error: unknown) => unreadable(error));
}

/** Copy one regular run file from the descriptor that passed the no-link held-file boundary.
 * The descriptor's initial size fixes the snapshot. Later appends and path replacement do not
 * redirect or extend it. A read failure can leave already-written bytes with an interrupted result. */
export async function copyHeldRunFile(
  directory: string, path: string, destination: () => Writable,
): Promise<CopiedRunFile> {
  const parts = path.split("/");
  const file = join(directory, ...parts);
  if (!file.startsWith(`${directory}/`)) return { kind: "missing" };
  const walked = await walk(directory, parts);
  if (!("file" in walked)) return walked;
  if (!await unchanged(walked.checked) || (walked.leaf.mode & 0o444) === 0) return unreadable();
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  return open(file, flags).then(
    async (descriptor) => {
      const observed = await descriptor.stat().then(
        (held) => ({ kind: "held" as const, held }),
        (error: unknown) => ({ kind: "unreadable" as const, error }),
      );
      if (observed.kind === "unreadable") {
        return descriptor.close().then(() => unreadable(observed.error), (error: unknown) => unreadable(error));
      }
      const held = observed.held;
      if (!held.isFile() || held.dev !== walked.leaf.dev || held.ino !== walked.leaf.ino) {
        return descriptor.close().then(() => unreadable(), (error: unknown) => unreadable(error));
      }
      const copied = await copyExact(descriptor, held.size, destination);
      return descriptor.close().then(
        () => copied,
        (error: unknown) => copied.kind === "interrupted" ? copied : interrupted("close", error),
      );
    },
    (error: unknown) => unreadable(error),
  );
}

export async function heldRunFile(directory: string, path: string): Promise<HeldRunFile> {
  const parts = path.split("/");
  const file = join(directory, ...parts);
  if (!file.startsWith(`${directory}/`)) return { kind: "missing" };
  const walked = await walk(directory, parts);
  if (!("file" in walked)) return walked;
  // Recheck every component after the walk. A replacement before the leaf was
  // named would otherwise make the later identity check compare the wrong file.
  if (!await unchanged(walked.checked)) return unreadable();
  if ((walked.leaf.mode & 0o444) === 0) return unreadable();
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  return open(file, flags).then(
    async (descriptor) => {
      try {
        const held = await descriptor.stat();
        if (!held.isFile() || held.dev !== walked.leaf.dev || held.ino !== walked.leaf.ino) return unreadable();
        if (held.size > INSPECTION_MAX_BYTES) return { kind: "too-large" as const };
        const bytes = await readExact(descriptor, held.size);
        if (bytes === undefined) return unreadable();
        // A writer can extend the file between the size check and the capped
        // read. Recheck the held descriptor so that race is not read whole.
        const final = await descriptor.stat();
        if (final.size > INSPECTION_MAX_BYTES) return { kind: "too-large" as const };
        if (!sameObject(final, held)) return unreadable();
        return { kind: "held" as const, bytes, mtime: held.mtimeMs, size: held.size };
      } finally {
        await descriptor.close();
      }
    },
    (error: unknown) => unreadable(error),
  ).then(
    (held) => held,
    (error: unknown) => unreadable(error),
  );
}

/** Read one safely held run file into memory under a caller-owned bound. */
export async function boundedHeldRunFile(
  directory: string, path: string, maximum: number, afterRead?: () => Promise<void>,
): Promise<HeldRunFile> {
  const held = await inspectHeldRunFile(directory, path, async (descriptor, observed) => {
    if (observed.size > maximum) return { kind: "too-large" as const };
    const bytes = await readExact(descriptor, observed.size);
    await afterRead?.();
    return bytes === undefined
      ? { kind: "unreadable" as const }
      : { kind: "held" as const, bytes, mtime: observed.mtimeMs, size: observed.size };
  });
  return held.kind !== "held" ? held : held.value;
}

export type HeldRunRead<T> =
  | Exclude<HeldRunFile, { kind: "held" } | { kind: "too-large" }>
  | { kind: "held"; observed: Stats; value: T };

/** Run one incremental reader against a no-follow descriptor, then publish its result only if the path stayed stable. */
export async function inspectHeldRunFile<T>(
  directory: string, path: string, inspect: (descriptor: FileHandle, observed: Stats) => Promise<T>,
): Promise<HeldRunRead<T>> {
  const parts = path.split("/");
  const file = join(directory, ...parts);
  if (!file.startsWith(`${directory}/`)) return { kind: "missing" };
  const walked = await walk(directory, parts);
  if (!("file" in walked)) return walked;
  if (!await unchanged(walked.checked) || (walked.leaf.mode & 0o444) === 0) return unreadable();
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  return open(file, flags).then(async (descriptor) => {
    try {
      const observed = await descriptor.stat();
      if (!observed.isFile() || observed.dev !== walked.leaf.dev || observed.ino !== walked.leaf.ino) return unreadable();
      const value = await inspect(descriptor, observed);
      const final = await descriptor.stat();
      return sameObject(final, observed) && await unchanged(walked.checked)
        ? { kind: "held" as const, observed, value }
        : unreadable();
    } finally {
      await descriptor.close();
    }
  }, (error: unknown) => unreadable(error)).catch((error: unknown) => unreadable(error));
}

export type HeldRecordLines =
  | Exclude<HeldRunFile, { kind: "held" }>
  | { kind: "bad-utf8" }
  | { kind: "held"; mtime: number; size: number; torn?: number };

async function visitOpenedRecordLines(
  descriptor: FileHandle, walked: Walked, visit: (line: string, index: number) => void,
): Promise<HeldRecordLines> {
  try {
    const held = await descriptor.stat();
    if (!held.isFile() || held.dev !== walked.leaf.dev || held.ino !== walked.leaf.ino) return unreadable();
    if (held.size > INSPECTION_MAX_BYTES) return { kind: "too-large" };
    const streamed = await streamRecordLines(descriptor, held.size, visit);
    const final = await descriptor.stat();
    if (final.size > INSPECTION_MAX_BYTES) return { kind: "too-large" };
    if (!sameObject(final, held) || !await unchanged(walked.checked)) return unreadable();
    if (streamed.kind !== "read") return streamed;
    return { kind: "held", mtime: held.mtimeMs, size: held.size, ...(streamed.torn === undefined ? {} : { torn: streamed.torn }) };
  } finally {
    await descriptor.close();
  }
}

/** Visit complete lines from one fixed record snapshot. The final unterminated
 * segment counts toward the limit and must be UTF-8, but is not published. */
export async function visitHeldRecordLines(
  directory: string, path: string, visit: (line: string, index: number) => void,
): Promise<HeldRecordLines> {
  const parts = path.split("/");
  const file = join(directory, ...parts);
  if (!file.startsWith(`${directory}/`)) return { kind: "missing" };
  const walked = await walk(directory, parts);
  if (!("file" in walked)) return walked;
  if (!await unchanged(walked.checked) || (walked.leaf.mode & 0o444) === 0) return unreadable();
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  return open(file, flags).then(
    (descriptor) => visitOpenedRecordLines(descriptor, walked, visit),
    (error: unknown) => unreadable(error),
  ).catch((error: unknown) => unreadable(error));
}

interface HeldTreeFile { path: string; sha256: string; bytes?: Buffer; executable: boolean }

export type HeldRunTree =
  | { kind: "absent"; files: HeldTreeFile[] }
  | { kind: "unreadable"; files: HeldTreeFile[] }
  | { kind: "held"; files: HeldTreeFile[] };

interface TreeCandidate { path: string; observed: Stats }
interface TreeWalk { candidates: TreeCandidate[]; observed: [string, Stats][]; entries: number }

function sameObject(actual: Stats | HeldRunFile, expected: Stats): boolean {
  return "isFile" in actual && !actual.isSymbolicLink()
    && actual.dev === expected.dev && actual.ino === expected.ino
    && actual.mode === expected.mode && actual.size === expected.size
    && actual.mtimeMs === expected.mtimeMs && actual.ctimeMs === expected.ctimeMs;
}

async function stableObserved(observed: [string, Stats][]): Promise<boolean> {
  for (const [path, expected] of observed) if (!sameObject(await named(path), expected)) return false;
  return true;
}

async function closeDirectory(directory: Dir): Promise<boolean> {
  return directory.close().then(() => true, () => false);
}

async function directoryEntries(path: string, remaining: number): Promise<Dirent[] | undefined> {
  const directory = await opendir(path).then((held) => held, () => undefined);
  if (directory === undefined) return undefined;
  const entries: Dirent[] = [];
  let failed = false;
  while (entries.length <= remaining) {
    const read = await directory.read().then(
      (entry) => ({ ok: true as const, entry }),
      () => ({ ok: false as const, entry: null }),
    );
    if (!read.ok) { failed = true; break; }
    if (read.entry === null) break;
    entries.push(read.entry);
  }
  const closed = await closeDirectory(directory);
  if (failed || !closed || entries.length > remaining) return undefined;
  return entries.sort((left, right) => bytewise(left.name, right.name));
}

async function treeEntry(root: string, relative: string, depth: number, walk: TreeWalk, entry: Dirent): Promise<boolean> {
  if (!visible(entry.name)) return true;
  if (depth >= INSPECTION_MAX_DEPTH) return false;
  const path = join(root, entry.name);
  const held = await named(path);
  if (!("isFile" in held) || held.isSymbolicLink()) return false;
  walk.observed.push([path, held]);
  const name = relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
  if (held.isDirectory()) return walkTree(path, name, depth + 1, walk);
  if (!held.isFile()) return false;
  walk.candidates.push({ path: name, observed: held });
  return true;
}

async function walkTree(root: string, relative: string, depth: number, walk: TreeWalk): Promise<boolean> {
  const entries = await directoryEntries(root, INSPECTION_MAX_ENTRIES - walk.entries);
  if (entries === undefined) return false;
  walk.entries += entries.length;
  for (const entry of entries) if (!await treeEntry(root, relative, depth, walk, entry)) return false;
  return true;
}

async function readTreeCandidates(root: string, candidates: TreeCandidate[], retainedPath: string | undefined): Promise<{ files: HeldTreeFile[]; sound: boolean }> {
  const files: HeldTreeFile[] = [];
  for (const candidate of candidates) {
    const file = await heldRunFile(root, candidate.path);
    const current = await named(join(root, ...candidate.path.split("/")));
    if (file.kind !== "held" || !sameObject(current, candidate.observed)) return { files, sound: false };
    files.push({ path: candidate.path, sha256: hashBytes(file.bytes), ...(candidate.path === retainedPath ? { bytes: file.bytes } : {}),
      executable: (candidate.observed.mode & 0o111) !== 0 });
  }
  return { files, sound: true };
}

function unavailableRoot(root: Stats | HeldRunFile): HeldRunTree | undefined {
  if ("isFile" in root) return root.isSymbolicLink() || !root.isDirectory() || (root.mode & 0o555) === 0 ? { kind: "unreadable", files: [] } : undefined;
  return root.kind === "missing" ? { kind: "absent", files: [] } : { kind: "unreadable", files: [] };
}

/** Safely enumerate and read a retained tree beneath a selected run. Every
 * published file survived a no-follow held read and a final identity check. */
export async function heldRunTree(directory: string, rootName: string, retainedPath?: string): Promise<HeldRunTree> {
  const runRoot = await rootDirectory(directory);
  if (!("isFile" in runRoot)) return { kind: "unreadable", files: [] };
  const rootPath = join(directory, rootName);
  const root = await named(rootPath);
  const unavailable = unavailableRoot(root);
  if (unavailable !== undefined || !("isFile" in root)) return unavailable ?? { kind: "unreadable", files: [] };
  const walk: TreeWalk = { candidates: [], observed: [[directory, runRoot], [rootPath, root]], entries: 0 };
  const walked = await walkTree(rootPath, "", 0, walk);
  const read = await readTreeCandidates(rootPath, walk.candidates, retainedPath);
  const stable = await stableObserved(walk.observed);
  return { kind: walked && read.sound && stable ? "held" : "unreadable", files: read.files };
}
