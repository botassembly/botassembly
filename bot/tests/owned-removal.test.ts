import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { removeOwnedTree } from "../src/owned-removal.ts";

const failure = vi.hoisted(() => ({
  chmodNoop: false,
  reason: undefined as NodeJS.ErrnoException | undefined,
  rmCalls: 0,
  root: undefined as string | undefined,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    chmod: async (...arguments_: Parameters<typeof original.chmod>) => {
      if (failure.chmodNoop && arguments_[0].toString() === failure.root) return;
      return original.chmod(...arguments_);
    },
    rm: async (...arguments_: Parameters<typeof original.rm>) => {
      if (arguments_[0].toString() !== failure.root || failure.reason === undefined) return original.rm(...arguments_);
      failure.rmCalls += 1;
      if (failure.rmCalls > 4) {
        throw Object.assign(new Error("test stopped an unbounded retry"), { code: "EIO", path: failure.root });
      }
      throw failure.reason;
    },
  };
});

const roots: string[] = [];
const restored: string[] = [];
const isRoot = process.getuid?.() === 0;

afterEach(async () => {
  failure.chmodNoop = false;
  failure.reason = undefined;
  failure.rmCalls = 0;
  failure.root = undefined;
  await Promise.all(restored.splice(0).map((path) => chmod(path, 0o700).catch(() => undefined)));
  await Promise.all(roots.splice(0).map(async (root) => {
    await chmod(root, 0o700).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }));
});

test.skipIf(isRoot)("removal finishes when a read-only parent contains another directory", async () => {
  const base = await mkdtemp(join(tmpdir(), "bot-owned-removal-"));
  roots.push(base);
  const root = join(base, "owned");
  const parent = join(root, "blocked");
  await mkdir(join(parent, "child"), { recursive: true });
  await writeFile(join(parent, "child", "data.txt"), "temporary\n");
  await chmod(parent, 0o500);
  restored.push(parent);

  await expect(removeOwnedTree(root)).resolves.toBeUndefined();
  await expect(mkdir(root)).resolves.toBeUndefined();
}, 1_000);

test("an unchanged permission failure returns the original filesystem fact", async () => {
  const base = await mkdtemp(join(tmpdir(), "bot-owned-removal-stuck-"));
  roots.push(base);
  const root = join(base, "owned");
  await mkdir(root);
  await chmod(root, 0o000);
  restored.push(root);
  const reason = Object.assign(new Error("permission denied"), {
    code: "EACCES",
    path: root,
    syscall: "rm",
  });
  failure.root = root;
  failure.reason = reason;
  failure.chmodNoop = true;

  await expect(removeOwnedTree(root)).rejects.toBe(reason);
  expect(failure.rmCalls).toBe(2);
}, 1_000);
