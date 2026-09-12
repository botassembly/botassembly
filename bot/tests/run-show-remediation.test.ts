import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { lockRun } from "../src/inspection.ts";
import { mapping } from "../src/model.ts";
import { inertText } from "../src/new-command-result.ts";
import { readRunShow } from "../src/run-show.ts";
import { currentRecord } from "./current-record.ts";
import { invokeCli } from "./invoke.ts";

type RecordRaceMode = "" | "append" | "replace";
const recordRace = vi.hoisted((): { target: string; mode: RecordRaceMode; mutated: boolean } => ({ target: "", mode: "", mutated: false }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    open: async (...arguments_: Parameters<typeof original.open>) => {
      const descriptor = await original.open(...arguments_);
      if (arguments_[0].toString() !== recordRace.target) return descriptor;
      return {
        stat: descriptor.stat.bind(descriptor), close: descriptor.close.bind(descriptor),
        read: async (buffer: NodeJS.ArrayBufferView, offset: number, length: number, position: number) => {
          if (recordRace.mode !== "" && !recordRace.mutated && position >= 64 * 1_024) {
            recordRace.mutated = true;
            if (recordRace.mode === "append") await original.appendFile(recordRace.target, "later");
            else {
              await original.rename(recordRace.target, `${recordRace.target}.old`);
              await original.writeFile(recordRace.target, "replacement");
            }
          }
          return descriptor.read(buffer, offset, length, position);
        },
      };
    },
  };
});

const stamp = "2026-09-10T12:00:00.000Z";
const roots: string[] = [];

afterEach(async () => {
  recordRace.target = ""; recordRace.mode = ""; recordRace.mutated = false;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(events: Record<string, unknown>[]): Promise<{ home: string; cache: string; run: string; directory: string; record: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-run-show-remediation-"));
  roots.push(root);
  const home = join(root, "home"), cache = join(root, "cache"), run = "2026-09-10T12-00-00-000Z-abcd", directory = join(home, "runs", run), record = join(directory, "record.jsonl");
  await mkdir(directory, { recursive: true });
  await writeFile(record, currentRecord(events));
  return { home, cache, run, directory, record };
}

interface ShowDocument {
  data: Record<string, unknown> & { stages: Array<Record<string, unknown>>; subflows: Array<Record<string, unknown>> };
  summary: Record<string, number>;
  warnings: Array<Record<string, unknown>>;
}

function document(reading: Awaited<ReturnType<typeof readRunShow>>): ShowDocument {
  const parsed: unknown = JSON.parse(reading.json.toString());
  return parsed as ShowDocument;
}

function cliDocument(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (!mapping(parsed)) throw new Error("expected CLI JSON document");
  return parsed;
}

test("root timestamps use optional source bounds and common inert human clipping", async () => {
  const startedAt = `2026-09-10T12:00:00.${"0".repeat(600)}Z`, endedAt = `2026-09-10T12:00:01.${"0".repeat(4_100)}Z`;
  const held = await fixture([
    { event: "run_start", ts: startedAt, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "run_end", ts: endedAt, exit: 1, cause: "refused" },
  ]);
  const reading = await readRunShow(held.home, held.run, join(held.cache, "bot", "tmp")), shown = document(reading), clipped = inertText(startedAt, 480);
  expect(shown.data).toMatchObject({ startedAt, endedAt: null });
  expect(shown.warnings).toEqual([
    { code: "text-unavailable", subject: held.run, field: "startedAt", omittedBytes: clipped.omitted },
    { code: "text-unavailable", subject: held.run, field: "endedAt", omittedBytes: Buffer.byteLength(endedAt) - 4_096 },
  ]);
  expect(reading.human.toString()).toContain(`startedAt: ${clipped.text}`);
  expect(reading.human.toString()).toContain("endedAt: -");
});

test("started child equality is validated before optional derived-child omission", async () => {
  const stage = `s${"x".repeat(4_080)}`, child = `stages/${stage}/1/1/subflows/1`;
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage, retry: 1 },
    { event: "subflow_call", ts: stamp, stage, retry: 1, call: 1, flow: "child", started: true, child },
  ]);
  const shown = document(await readRunShow(held.home, held.run, join(held.cache, "bot", "tmp")));
  expect(shown.data.subflows[0]?.child).toBeNull();
  expect(shown.warnings).toContainEqual({ code: "text-unavailable", subject: `${stage}/1:call/1`, field: "child", omittedBytes: Buffer.byteLength(child) - 4_096 });
  expect(shown.warnings.map((warning) => warning.field)).toEqual(["identity", "stage", "caller", "child"]);
  await writeFile(held.record, currentRecord([
    { event: "run_start", ts: stamp, record: 1, run: held.run, assembly: "demo" },
    { event: "stage_start", ts: stamp, stage, retry: 1 },
    { event: "subflow_call", ts: stamp, stage, retry: 1, call: 1, flow: "child", started: true, child: `${child}x` },
  ]));
  await expect(readRunShow(held.home, held.run, join(held.cache, "bot", "tmp"))).rejects.toMatchObject({ failure: { code: "integrity-failed" } });
});

test("warnings order root fields before combined rows and fields within rows", async () => {
  const startedAt = `2026-09-10T12:00:00.${"0".repeat(600)}Z`, stage = `<${"s".repeat(600)}|`;
  const held = await fixture([
    { event: "run_start", ts: startedAt, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage, retry: 1 },
  ]);
  const shown = document(await readRunShow(held.home, held.run, join(held.cache, "bot", "tmp")));
  expect(shown.warnings.map((warning: Record<string, unknown>) => warning.field)).toEqual(["startedAt", "identity", "stage"]);
});

test.each([
  { stageBytes: 4_094, code: 0 },
  { stageBytes: 4_095, code: 5 },
])("a constructed warning subject at the retained-text boundary returns exit $code", async ({ stageBytes, code }) => {
  const stage = `<${"x".repeat(stageBytes - 2)}|`, subject = `${stage}/1`;
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage, retry: 1 },
  ]);
  const result = await invokeCli(["run", "show", held.run, "-j"], held);
  expect(result.code).toBe(code);
  if (code === 0) {
    expect(Buffer.byteLength(subject)).toBe(4_096);
    expect(cliDocument(result.out)["warnings"]).toEqual([
      { code: "text-unavailable", subject, field: "identity", omittedBytes: inertText(stage, 480).omitted },
      { code: "text-unavailable", subject, field: "stage", omittedBytes: inertText(stage, 480).omitted },
    ]);
  } else {
    expect(result.out).toBe("");
    expect(JSON.parse(result.err)).toMatchObject({ error: { code: "integrity-failed", operation: "run.show" } });
  }
});

test("one unique stage-repeat scratch observation is reused across retries", async () => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage: "work", repeat: 2, retry: 1 },
    { event: "stage_start", ts: stamp, stage: "work", repeat: 2, retry: 2 },
  ]);
  const observed: string[] = [];
  const reading = await readRunShow(held.home, held.run, join(held.cache, "bot", "tmp"), { scratch: (path: string) => { observed.push(path); return Promise.resolve(true); } });
  expect(observed).toHaveLength(1);
  expect(document(reading).data.stages.map((row: Record<string, unknown>) => row.scratch)).toEqual([observed[0], observed[0]]);
});

test("scratch disappearance yields null and a non-ENOENT fault yields one dependency failure", async () => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage: "work", retry: 1 },
  ]);
  const absent = await readRunShow(held.home, held.run, join(held.cache, "bot", "tmp"), { scratch: () => Promise.resolve(false) });
  expect(document(absent).data.stages).toEqual([expect.objectContaining({ scratch: null })]);
  await expect(readRunShow(held.home, held.run, join(held.cache, "bot", "tmp"), { scratch: () => Promise.reject(Object.assign(new Error("denied"), { code: "EACCES" })) })).rejects.toMatchObject({ failure: { code: "dependency-failed", cause: "scratch-unavailable" } });
});

test("unexpected runs enumeration access fails as a dependency", async () => {
  const held = await fixture([]);
  await chmod(held.home, 0o600);
  const result = await invokeCli(["run", "show", held.run, "-j"], held);
  await chmod(held.home, 0o700);
  expect(result.code).toBe(4);
  expect(JSON.parse(result.err)).toMatchObject({ error: { code: "dependency-failed" } });
});

test("a missing runs directory remains an exit-one empty selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-run-show-no-runs-"));
  roots.push(root);
  const home = join(root, "home");
  await mkdir(home);
  const result = await invokeCli(["run", "show", "absent", "-j"], { home });
  expect(result.code).toBe(1);
  expect(JSON.parse(result.err)).toMatchObject({ error: { code: "home-not-found", cause: "run-missing" } });
});

test("lock sampling precedes the first scratch observation", async () => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage: "work", retry: 1 },
  ]);
  const observations: string[] = [];
  let locked = true;
  const reading = await readRunShow(held.home, held.run, join(held.cache, "bot", "tmp"), {
    live: () => { observations.push("lock"); locked = false; return true; },
    scratch: () => { observations.push("scratch"); expect(locked).toBe(false); return false; },
  });
  expect(observations).toEqual(["lock", "scratch"]);
  expect(document(reading).data).toMatchObject({ state: "running", endedAt: null, exit: null, cause: null });
});

test.each(["append", "replace"] as const)("a real command-path mid-read %s refuses without partial output", async (mode) => {
  const held = await fixture([{ event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo", padding: "x".repeat(150_000) }]);
  recordRace.target = held.record; recordRace.mode = mode;
  const result = await invokeCli(["run", "show", held.run, "-j"], held);
  expect(recordRace.mutated).toBe(true);
  expect(result.code).toBe(5);
  expect(result.out).toBe("");
  expect(JSON.parse(result.err)).toMatchObject({ error: { code: "integrity-failed", operation: "run.show" } });
});

test("subflow call counters may restart on a later stage attempt", async () => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage: "parent", retry: 1 },
    { event: "subflow_call", ts: stamp, stage: "parent", retry: 1, call: 1, flow: "child", started: false },
    { event: "stage_start", ts: stamp, stage: "parent", retry: 2 },
    { event: "subflow_call", ts: stamp, stage: "parent", retry: 2, call: 1, flow: "child", started: false },
  ]);
  const shown = document(await readRunShow(held.home, held.run, join(held.cache, "bot", "tmp")));
  expect(shown.data.subflows).toEqual([
    { caller: "parent", attempt: 1, call: 1, subflow: "child", item: null, started: false, child: null, exit: null, cause: null },
    { caller: "parent", attempt: 2, call: 1, subflow: "child", item: null, started: false, child: null, exit: null, cause: null },
  ]);
});

test.each(["ended", "running", "crashed", "incomplete"] as const)("$0 has exact complete JSON", async (state) => {
  const events = state === "incomplete" ? [] : [
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    ...(state === "ended" ? [{ event: "run_end", ts: stamp, exit: 1, cause: "refused" }] : []),
  ];
  const held = await fixture(events);
  if (state === "incomplete") await writeFile(held.record, "");
  const release = state === "running" ? lockRun(held.directory) : undefined;
  const result = await invokeCli(["run", "show", held.run, "-j"], held);
  release?.();
  expect(result.code).toBe(0);
  expect(result.err).toBe("");
  expect(JSON.parse(result.out)).toEqual({
    schemaVersion: 1, kind: "bot.run.show",
    data: { run: held.run, state, startedAt: state === "incomplete" ? null : stamp, endedAt: state === "ended" ? stamp : null, exit: state === "ended" ? 1 : null, cause: state === "ended" ? "refused" : null, stages: [], subflows: [] },
    summary: { stageCount: 0, stagesIncluded: 0, stagesOmitted: 0, subflowCount: 0, subflowsIncluded: 0, subflowsOmitted: 0, warningCount: 0, warningsOmitted: 0 }, warnings: [],
  });
});

test("an oversized record returns the integrity envelope without partial output", async () => {
  const held = await fixture([]);
  await writeFile(held.record, "x".repeat(1_048_577));
  const result = await invokeCli(["run", "show", held.run, "-j"], held);
  expect(result.code).toBe(5);
  expect(result.out).toBe("");
  expect(JSON.parse(result.err)).toMatchObject({ error: { code: "integrity-failed", operation: "run.show" } });
});

test("human output keeps stable sections", async () => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "run_end", ts: stamp, exit: 1, cause: "refused" },
  ]);
  const reading = await readRunShow(held.home, held.run, join(held.cache, "bot", "tmp"));
  expect(reading.human.toString().split("\n").slice(0, 16)).toEqual([
    `run: ${held.run}`, "state: ended", `startedAt: ${stamp}`, `endedAt: ${stamp}`, "exit: 1", "cause: refused", "",
    "| identity | stage | repeat | attempt | state | exit | cause | scratch |", "| --- | --- | --- | --- | --- | --- | --- | --- |", "",
    "| caller | attempt | call | subflow | item | started | child | exit | cause |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |", "",
    "stageCount: 0", "stagesIncluded: 0", "stagesOmitted: 0",
  ]);
});

function humanIncluded(reading: Awaited<ReturnType<typeof readRunShow>>): number {
  const match = /^stagesIncluded: (\d+)$/m.exec(reading.human.toString());
  if (match?.[1] === undefined) throw new Error("missing human stage count");
  return Number(match[1]);
}

test.each([
  { name: "JSON", second: { event: "subflow_call", ts: stamp, stage: "first", retry: 1, call: 1, flow: `child-${"x".repeat(4_000)}`, started: false }, larger: (reading: Awaited<ReturnType<typeof readRunShow>>) => reading.json.length, smaller: (reading: Awaited<ReturnType<typeof readRunShow>>) => reading.human.length },
  { name: "Markdown", second: { event: "stage_start", ts: stamp, stage: `markdown-${"&".repeat(400)}`, retry: 1 }, larger: (reading: Awaited<ReturnType<typeof readRunShow>>) => reading.human.length, smaller: (reading: Awaited<ReturnType<typeof readRunShow>>) => reading.json.length },
])("the independent $name ceiling selects the same shared prefix", async ({ second, larger, smaller }) => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage: "first", retry: 1 },
    second,
  ]);
  const scratch = join(held.cache, "bot", "tmp"), complete = await readRunShow(held.home, held.run, scratch, { scratch: () => false });
  expect(larger(complete)).toBeGreaterThan(smaller(complete));
  const maximum = smaller(complete) + 1;
  const bounded = await readRunShow(held.home, held.run, scratch, { documentBytes: maximum, scratch: () => false });
  expect(bounded.json.length).toBeLessThan(maximum);
  expect(bounded.human.length).toBeLessThan(maximum);
  expect(document(bounded).summary).toMatchObject({ stagesIncluded: 1, subflowsIncluded: 0 });
  expect(humanIncluded(bounded)).toBe(1);
});
