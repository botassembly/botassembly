// Removal only repairs a directory the caller has already proved it owns. A
// recursive `rm` can name a child when an ancestor blocks removal. Search only
// toward the owned root and never follow a symbolic link.
import type { Stats } from "node:fs";
import { chmod, lstat, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { errorCode } from "./model.ts";

function errorPath(reason: unknown): string | undefined {
  return typeof reason === "object" && reason !== null && "path" in reason && typeof reason.path === "string"
    ? reason.path
    : undefined;
}

function within(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot === "" || (!isAbsolute(fromRoot) && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`));
}

function needsOwnerAccess(entry: Stats | undefined, repaired: boolean): entry is Stats {
  return entry?.isDirectory() === true && !entry.isSymbolicLink() && (entry.mode & 0o700) !== 0o700 && !repaired;
}

async function restoreOwnedDirectory(root: string, reason: unknown, repaired: Set<string>): Promise<boolean> {
  const path = errorPath(reason);
  if (path === undefined || !within(root, path)) return false;
  let candidate = path;
  while (within(root, candidate)) {
    const entry = await lstat(candidate).then((found) => found, () => undefined);
    if (needsOwnerAccess(entry, repaired.has(candidate))) {
      const changed = await chmod(candidate, entry.mode | 0o700).then(() => true, () => false);
      if (!changed) return false;
      repaired.add(candidate);
      return true;
    }
    if (candidate === root) return false;
    const parent = dirname(candidate);
    if (parent === candidate) return false;
    candidate = parent;
  }
  return false;
}

export async function removeOwnedTree(root: string, force = false): Promise<void> {
  const repaired = new Set<string>();
  for (;;) {
    const failure = await rm(root, { recursive: true, force }).then(() => undefined, (reason: unknown) => reason);
    if (failure === undefined) return;
    if (errorCode(failure) === "EACCES" && await restoreOwnedDirectory(root, failure, repaired)) continue;
    if (failure instanceof Error) throw failure;
    throw new Error("Owned tree removal failed.", { cause: failure });
  }
}
