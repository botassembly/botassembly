import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { invokeCli } from "./invoke.ts";
import { currentRecord } from "./current-record.ts";
import { lockRun } from "../src/inspection.ts";
import { attemptKey, scratchAttempt, scratchOfRun } from "../src/invocation.ts";
import { inertText } from "../src/new-command-result.ts";
import { mapping } from "../src/model.ts";

const stamp = "2026-09-10T12:00:00.000Z";
const roots: string[] = [];

function object(text: string): Record<string, unknown> {
  const held: unknown = JSON.parse(text);
  if (!mapping(held)) throw new Error("Expected a JSON object.");
  return held;
}

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(events: Record<string, unknown>[]): Promise<{ home: string; cache: string; run: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-run-show-"));
  roots.push(root);
  const home = join(root, "home"), cache = join(root, "cache"), run = "2026-09-10T12-00-00-000Z-abcd";
  await mkdir(join(home, "runs", run), { recursive: true });
  await writeFile(join(home, "runs", run, "record.jsonl"), currentRecord(events));
  return { home, cache, run };
}

test("run show reads one ended run through the normal CLI", async () => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage: "write|<x>", repeat: 2, retry: 1 },
    { event: "stage_end", ts: stamp, stage: "write|<x>", repeat: 2, retry: 1, exit: 1, cause: "refused" },
    { event: "run_end", ts: stamp, exit: 1, cause: "refused" },
  ]);
  const result = await invokeCli(["run", "show", held.run.slice(0, 20), "--json"], held);
  expect(result.code).toBe(0);
  expect(result.err).toBe("");
  expect(JSON.parse(result.out)).toMatchObject({
    kind: "bot.run.show",
    data: { state: "ended", stages: [{
      identity: "write|<x>#2", stage: "write|<x>", repeat: 2, attempt: 1,
      state: "ended", exit: 1, cause: "refused", scratch: null,
    }] },
  });
});

test("run show gives identical run ids in two homes distinct scratch paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-run-show-two-homes-"));
  roots.push(root);
  const cache = join(root, "cache"), run = "2026-09-10T12-00-00-000Z-abcd";
  const homes = [join(root, "alpha"), join(root, "beta")];
  const expected: string[] = [];
  for (const home of homes) {
    const directory = join(home, "runs", run);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "record.jsonl"), currentRecord([
      { event: "run_start", ts: stamp, record: 1, run, assembly: "demo" },
      { event: "stage_start", ts: stamp, stage: "01-work", retry: 1 },
    ]));
    const scratch = scratchAttempt(scratchOfRun(join(cache, "bot", "tmp"), home, run), attemptKey("01-work", undefined));
    expected.push(scratch);
    await mkdir(scratch, { recursive: true });
  }

  const readings = await Promise.all(homes.map(async (home) => {
    const result = await invokeCli(["run", "show", run, "-j"], { home, cache });
    expect(result.code, result.err).toBe(0);
    const data = object(result.out)["data"];
    if (!mapping(data) || !Array.isArray(data["stages"])) throw new Error("Expected run data with stages.");
    const first: unknown = data["stages"][0];
    if (!mapping(first)) throw new Error("Expected a first stage.");
    return first["scratch"];
  }));
  expect(readings).toEqual(expected);
  expect(readings[0]).not.toBe(readings[1]);
});

test("run show reports started subflows without opening child records", async () => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage: "parent", retry: 1 },
    { event: "subflow_call", ts: stamp, stage: "parent", retry: 1, call: 3, flow: "child", started: true, child: "stages/parent/1/1/subflows/3", exit: 0, cause: "success" },
    { event: "stage_end", ts: stamp, stage: "parent", retry: 1, exit: 0, cause: "success" },
    { event: "run_end", ts: stamp, exit: 0, cause: "success" },
  ]);
  const result = await invokeCli(["run", "show", held.run, "-j"], held);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out)).toMatchObject({ data: { subflows: [{ caller: "parent", attempt: 1, call: 3, subflow: "child", item: null,
    started: true, child: "stages/parent/1/1/subflows/3", exit: 0, cause: "success" }] } });
});

test("run show refuses malformed requests before reading home", async () => {
  const result = await invokeCli(["run", "show", "one", "two", "--json"], { home: "/definitely/absent" });
  expect(result.code).toBe(2);
  expect(result.out).toBe("");
  expect(JSON.parse(result.err)).toMatchObject({ error: { code: "request-invalid" } });
});

test("run show treats an empty record as a successful incomplete reading", async () => {
  const held = await fixture([]);
  await writeFile(join(held.home, "runs", held.run, "record.jsonl"), "");
  const result = await invokeCli(["run", "show", held.run, "-j"], held);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out)).toMatchObject({ data: { run: held.run, state: "incomplete", startedAt: null, endedAt: null, exit: null, cause: null, stages: [], subflows: [] } });
});

test("run show maps malformed consumed child facts to one integrity failure", async () => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage: "parent", retry: 1 },
    { event: "subflow_call", ts: stamp, stage: "parent", retry: 1, call: 1, flow: "child", started: true, child: "elsewhere", exit: 0, cause: "success" },
  ]);
  const result = await invokeCli(["run", "show", held.run, "--json"], held);
  expect(result).toMatchObject({ code: 5, out: "" });
  expect(JSON.parse(result.err)).toMatchObject({ error: { code: "integrity-failed", operation: "run.show" } });
});

test.each([
  ["call", { call: 0 }],
  ["subflow", { flow: "" }],
  ["started", { started: "yes" }],
  ["item", { item: "orphan" }],
  ["child", { child: 7 }],
  ["one-sided outcome", { exit: 1 }],
])("run show rejects a malformed consumed %s fact", async (_name, changed) => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage: "parent", retry: 1 },
    { event: "subflow_call", ts: stamp, stage: "parent", retry: 1, call: 1, flow: "child", started: false, ...changed },
  ]);
  const result = await invokeCli(["run", "show", held.run, "-j"], held);
  expect(result).toMatchObject({ code: 5, out: "" });
  expect(JSON.parse(result.err)).toMatchObject({ error: { code: "integrity-failed" } });
});

test.each([
  ["stage", "stages/other/2/3/subflows/4"],
  ["repeat", "stages/parent/1/3/subflows/4"],
  ["retry", "stages/parent/2/1/subflows/4"],
  ["call", "stages/parent/2/3/subflows/1"],
])("run show rejects a syntactically valid child with a mismatched %s", async (_name, child) => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage: "parent", repeat: 2, retry: 3 },
    { event: "subflow_call", ts: stamp, stage: "parent", repeat: 2, retry: 3, call: 4, flow: "child", started: true, child },
  ]);
  expect((await invokeCli(["run", "show", held.run, "-j"], held)).code).toBe(5);
});

test("run show human output makes retained Markdown inert", async () => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage: "<b>|line", retry: 1 },
  ]);
  const result = await invokeCli(["run", "show", held.run], held);
  expect(result.code).toBe(0);
  expect(result.out).toContain("&lt;b&gt;\\|line");
  expect(Buffer.byteLength(result.out)).toBeLessThan(1_048_576);
  expect(result.out.split("\n").every((line) => Buffer.byteLength(line) <= 4_096)).toBe(true);
});

test("run show samples running and crashed from the existing lock predicate", async () => {
  const held = await fixture([{ event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" }]);
  const release = lockRun(join(held.home, "runs", held.run));
  const running = await invokeCli(["run", "show", held.run, "-j"], held);
  release();
  const crashed = await invokeCli(["run", "show", held.run, "-j"], held);
  expect(JSON.parse(running.out)).toMatchObject({ data: { state: "running" } });
  expect(JSON.parse(crashed.out)).toMatchObject({ data: { state: "crashed" } });
});

test("stage retries share one observed stage-repeat scratch directory", async () => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage: "work", repeat: 3, retry: 1 },
    { event: "stage_start", ts: stamp, stage: "work", repeat: 3, retry: 2 },
  ]);
  const root = join(held.cache, "bot", "tmp"), scratch = scratchAttempt(scratchOfRun(root, held.home, held.run), attemptKey("work", 3));
  await mkdir(scratch, { recursive: true });
  const result = await invokeCli(["run", "show", held.run, "-j"], held);
  expect(JSON.parse(result.out)).toMatchObject({ data: { stages: [{ scratch }, { scratch }] } });
});

test("human clipping keeps full JSON text and reports exact escaped omissions", async () => {
  const stage = `<${"x".repeat(600)}|`;
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage, retry: 1 },
  ]);
  const result = await invokeCli(["run", "show", held.run, "-j"], held), clipped = inertText(stage, 480);
  expect(JSON.parse(result.out)).toMatchObject({ data: { stages: [{ identity: stage, stage }] }, summary: { warningCount: 2, warningsOmitted: 0 }, warnings: [
    { code: "text-unavailable", subject: `${stage}/1`, field: "identity", omittedBytes: clipped.omitted },
    { code: "text-unavailable", subject: `${stage}/1`, field: "stage", omittedBytes: clipped.omitted },
  ] });
});

test("warning output keeps the first twenty warnings and counts the suffix", async () => {
  const events: Record<string, unknown>[] = [{ event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" }];
  for (let at = 0; at < 11; at += 1) events.push({ event: "stage_start", ts: stamp, stage: `${String(at)}-${"x".repeat(600)}`, retry: 1 });
  const held = await fixture(events), result = await invokeCli(["run", "show", held.run, "-j"], held);
  expect(JSON.parse(result.out)).toMatchObject({ summary: { warningCount: 22, warningsOmitted: 2 } });
  expect(object(result.out)["warnings"]).toHaveLength(20);
});

test("the combined row cap reports every row and retains one contiguous prefix", async () => {
  const events: Record<string, unknown>[] = [{ event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" }];
  for (let at = 0; at < 1_001; at += 1) events.push({ event: "stage_start", ts: stamp, stage: `stage-${String(at)}`, retry: 1 });
  const held = await fixture(events), result = await invokeCli(["run", "show", held.run, "-j"], held), document = object(result.out), data = document["data"];
  expect(mapping(data) ? data["stages"] : undefined).toHaveLength(1_000);
  expect(document["summary"]).toMatchObject({ stageCount: 1_001, stagesIncluded: 1_000, stagesOmitted: 1 });
});

test("required stage identity text above the source bound fails integrity", async () => {
  const held = await fixture([
    { event: "run_start", ts: stamp, record: 1, run: "2026-09-10T12-00-00-000Z-abcd", assembly: "demo" },
    { event: "stage_start", ts: stamp, stage: "x".repeat(4_097), retry: 1 },
  ]);
  expect((await invokeCli(["run", "show", held.run, "-j"], held)).code).toBe(5);
});

test.each(["malformed", "unsupported", "non-file", "unreadable"])("shared record fault %s maps to one integrity failure", async (kind) => {
  const held = await fixture([]), path = join(held.home, "runs", held.run, "record.jsonl");
  if (kind === "malformed") await writeFile(path, "{bad}\n");
  if (kind === "unsupported") await writeFile(path, `${JSON.stringify({ record: 99, ts: stamp, event: "run_start", run: held.run })}\n`);
  if (kind === "non-file") { await rm(path); await mkdir(path); }
  if (kind === "unreadable") await chmod(path, 0o000);
  const result = await invokeCli(["run", "show", held.run, "-j"], held);
  expect(result).toMatchObject({ code: 5, out: "" });
  if (kind === "unreadable") await chmod(path, 0o600);
});

test("run show rejects missing and ambiguous exact-prefix selections", async () => {
  const held = await fixture([]);
  await mkdir(join(held.home, "runs", `${held.run}-other`));
  const ambiguous = await invokeCli(["run", "show", held.run, "-j"], held);
  const missing = await invokeCli(["run", "show", "absent", "-j"], held);
  expect(JSON.parse(ambiguous.err)).toMatchObject({ error: { code: "home-not-found", cause: "run-ambiguous" } });
  expect(JSON.parse(missing.err)).toMatchObject({ error: { code: "home-not-found", cause: "run-missing" } });
  expect(ambiguous.code).toBe(1);
  expect(missing.code).toBe(1);
});

test.each([
  ["missing run", ["run", "show"]],
  ["repeated JSON", ["run", "show", "run", "-j", "--json"]],
  ["repeated home", ["run", "show", "run", "--home", "/a", "--home", "/b"]],
  ["unknown option", ["run", "show", "run", "--raw"]],
])("run show refuses %s before home access", async (_name, words) => {
  const result = await invokeCli(words, { home: "/definitely/absent" });
  expect(result.code).toBe(2);
});
