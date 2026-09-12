import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const shortRead = vi.hoisted(() => ({ path: "", replace: "", observations: 0 }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    lstat: async (...arguments_: Parameters<typeof original.lstat>) => {
      if (arguments_[0].toString() === shortRead.replace) {
        shortRead.observations += 1;
        if (shortRead.observations === 2) {
          await original.rename(shortRead.replace, `${shortRead.replace}.old`);
          await original.writeFile(shortRead.replace, "replacement bytes");
        }
      }
      return original.lstat(...arguments_);
    },
    open: async (...arguments_: Parameters<typeof original.open>) => {
      const descriptor = await original.open(...arguments_);
      if (arguments_[0].toString() !== shortRead.path) return descriptor;
      return {
        stat: descriptor.stat.bind(descriptor),
        close: descriptor.close.bind(descriptor),
        read: (buffer: NodeJS.ArrayBufferView, offset: number, length: number, position: number) =>
          descriptor.read(buffer, offset, Math.min(length, 2), position),
      };
    },
  };
});

import { heldRunFile } from "../src/run-files.ts";

const roots: string[] = [];

afterEach(async () => {
  shortRead.path = "";
  shortRead.replace = "";
  shortRead.observations = 0;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("a held file rejects an inode replaced between observation and open", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-replaced-read-"));
  roots.push(root);
  const path = join(root, "request.txt");
  await writeFile(path, "original bytes");
  shortRead.replace = path;

  await expect(heldRunFile(root, "request.txt")).resolves.toMatchObject({ kind: "unreadable" });
});

test("a held file completes short positional reads before publishing its facts", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-short-read-"));
  roots.push(root);
  const path = join(root, "record.jsonl");
  const expected = Buffer.from("complete bytes");
  await writeFile(path, expected);
  shortRead.path = path;

  const held = await heldRunFile(root, "record.jsonl");

  expect(held).toMatchObject({ kind: "held", size: expected.length });
  if (held.kind === "held") expect(held.bytes).toEqual(expected);
});
