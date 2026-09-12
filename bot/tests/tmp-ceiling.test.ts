// Ticket 0127 — a ceiling samples live stage scratch without turning an
// unreadable descendant into a run-ending measurement error.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { readAssembly } from "../src/assembly.ts";
import type { Assembly } from "../src/model.ts";
import { showLine } from "../src/readings.ts";
import { outputOf } from "./hostile.ts";
import { events, roots, start, type Script } from "./flow-harness.ts";
import { manualClock } from "./manual-clock.ts";

const directories: string[] = [];
const sealed: string[] = [];
const GIB = 1024 ** 3;
const isRoot = process.getuid?.() === 0;

type CappedAssembly = Assembly & { tmpMaxBytes?: number };

// A permission-000 fixture needs its door restored before the ordinary cleanup
// can enter it. Root can read it regardless, so it cannot exercise EACCES.
afterEach(async () => {
  await Promise.all(sealed.splice(0).map((path) => chmod(path, 0o700).catch(() => undefined)));
  await Promise.all([
    ...roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    ...directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  ]);
});

async function assembly(cap?: number): Promise<CappedAssembly> {
  const root = await mkdtemp(join(tmpdir(), "bot-tmp-ceiling-"));
  directories.push(root);
  const flow = join(root, "flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), `---\n${cap === undefined ? "" : `tmp-max-bytes: ${String(cap)}\n`}---\nBounded scratch.\n`),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nWork.\n"),
  ]);
  return readAssembly(root, {});
}

test("an assembly defaults its tmp ceiling and accepts an explicit ceiling", async () => {
  const defaulted = await assembly();
  expect(defaulted.faults).toEqual([]);
  expect(defaulted.tmpMaxBytes).toBe(GIB);
  const configured = await assembly(3);
  expect(configured.faults).toEqual([]);
  expect(configured.tmpMaxBytes).toBe(3);
});

test.skipIf(isRoot)("an unreadable tmp descendant is skipped while readable bytes still breach the live ceiling", async () => {
  const bounded = await assembly();
  bounded.tmpMaxBytes = 3;
  const main = bounded.flows.get("main");
  const time = manualClock();
  const tmpSamples: Promise<number>[] = [];
  let signalAdvanced = (): void => undefined;
  const advanced = new Promise<void>((resolve) => { signalAdvanced = resolve; });
  let restoreDoor = (): void => undefined;
  const doorRestored = new Promise<void>((resolve) => { restoreDoor = resolve; });
  expect(main).toBeDefined();
  if (main === undefined) throw new Error("Missing main flow.");
  const scripts = new Map<string, Script>([["main:01-work:1", (context) => [async () => {
    const blocked = join(context.tmpPath, "unreadable");
    await mkdir(blocked);
    await writeFile(join(blocked, "hidden.bin"), Buffer.alloc(5));
    await writeFile(join(context.tmpPath, "measured.bin"), Buffer.alloc(4));
    await chmod(blocked, 0o000);
    sealed.push(blocked);
    await writeFile(outputOf(context), "would otherwise pass\n");
    time.advance(1_000);
    signalAdvanced();
    await doorRestored;
    await chmod(blocked, 0o700);
    return fauxAssistantMessage("finished");
  }, fauxAssistantMessage("finish anyway")]]]);
  const run = await start(main, bounded, scripts, {
    clock: time,
    observeTmpSample: (sample) => { tmpSamples.push(sample); },
  });
  await advanced;
  let observationFailure: Error | undefined;
  try {
    expect(tmpSamples[0]).toBeDefined();
    await expect(tmpSamples[0]).resolves.toBe(4);
  } catch (reason) {
    observationFailure = reason instanceof Error ? reason : new Error("Temporary sample observation failed.", { cause: reason });
  } finally {
    restoreDoor();
  }

  await expect(run.result).resolves.toMatchObject({ exit: 2, cause: "fault" });
  if (observationFailure !== undefined) throw observationFailure;
  const record = await events(run.writer.writer.recordPath);
  const ending = record.find((event) => event["event"] === "run_end");
  expect(ending).toMatchObject({ event: "run_end", exit: 2, cause: "fault" });
  const reason = typeof ending?.["reason"] === "string" ? ending["reason"] : "";
  for (const fact of ["$TMP", "4 bytes", "3 bytes"]) expect(reason).toContain(fact);
  expect(showLine(ending ?? {})).toContain(reason);
});
