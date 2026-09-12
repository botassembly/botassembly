// Ticket 0120, ceiling three — eight files hashed at once, Ian's ruling of
// 2026-08-05. `prehashAssembly` used to `Promise.all` every file in the tree,
// so a big assembly fanned out as wide as it happened to be. This is the only
// one of the three ceilings a person never sees hit: it changes no outcome, no
// exit code and no record, so it owes the specification no sentence — what it
// owes is a witness that the fan-out is bounded and that bounding it did not
// reorder the identity lines.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { mapPool, runPool } from "../src/pool.ts";
import { HASH_IN_FLIGHT, hashBytes, prehashAssembly } from "../src/record.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// The width is a literal here and not HASH_IN_FLIGHT: asserting the peak
// against the very constant under test passes whatever the constant says, which
// is how the first draft of this file survived a falsification that moved it.
test("mapPool never holds more than `width` in flight, and answers in item order", async () => {
  let live = 0;
  let peak = 0;
  const items = Array.from({ length: 40 }, (_unused, index) => index);
  const doubled = await mapPool(items, 3, async (item) => {
    live += 1;
    peak = Math.max(peak, live);
    await Promise.resolve();
    live -= 1;
    return item * 2;
  });
  expect(peak).toBe(3);
  expect(doubled).toEqual(items.map((item) => item * 2));
});

test("runPool stops dispatching when a worker rejects", async () => {
  const rejection = new Error("worker rejected");
  const started: string[] = [];
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const pool = runPool({
    items: ["reject", "held", "never"], width: 2, cancelled: () => false,
    run: async (item) => {
      started.push(item);
      if (item === "reject") throw rejection;
      if (item === "held") await held;
      return { value: item, stop: false };
    },
  });
  await Promise.resolve();
  release();
  await expect(pool).resolves.toMatchObject({
    values: [undefined, "held", undefined], started: [true, true, false], concurrent: 2,
    rejections: [{ index: 0, error: rejection }],
  });
  expect(started).toEqual(["reject", "held"]);
});

// The number itself changes no outcome a caller can observe — it is a pin on
// Ian's ruling of 2026-08-05, not a witness of behaviour, and is named as such
// in 0120's report.
test("the hash fan-out is the ruled eight", () => {
  expect(HASH_IN_FLIGHT).toBe(8);
});

// The order the lines are joined in is the assembly's identity (ADR 0016), and
// a pool answers as its workers finish. More files than the width is the case
// that would catch a pool whose results came back in completion order.
test("prehashAssembly holds bytewise path order across more files than the width", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-ceiling-hash-"));
  roots.push(root);
  const names = Array.from({ length: HASH_IN_FLIGHT * 3 + 1 }, (_unused, index) => `f${String(index).padStart(2, "0")}.txt`);
  await Promise.all(names.map((name) => writeFile(join(root, name), name)));
  const prehash = await prehashAssembly(root);
  expect([...prehash.files.keys()]).toEqual([...names].sort());
  expect(prehash.sha256).toBe(hashBytes([...names].sort().map((name) => `${name}:${hashBytes(name)}`).join("\n")));
});
