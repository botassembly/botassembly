import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { hashBytes } from "../src/record.ts";
import { heldRecord } from "../src/record-lines.ts";
import { inspectRuns, readRunState } from "../src/inspection.ts";
import { currentRecord } from "./current-record.ts";

const roots: string[] = [];
const TS = "2026-09-13T12:00:00.000Z";
const HASH = "a".repeat(64);

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function runDirectory(events: Record<string, unknown>[]): Promise<{ home: string; directory: string; run: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-consumption-"));
  roots.push(root);
  const home = join(root, "home"), run = "root", directory = join(home, "runs", run);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "record.jsonl"), currentRecord(events));
  return { home, directory, run };
}

async function rawRunDirectory(events: Record<string, unknown>[]): Promise<{ home: string; directory: string; run: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-consumption-raw-"));
  roots.push(root);
  const home = join(root, "home"), run = "root", directory = join(home, "runs", run);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "record.jsonl"), `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  return { home, directory, run };
}

function start(run = "root", via = "argument"): Record<string, unknown> {
  return { record: 1, event: "run_start", ts: TS, run, assembly: "review", assembly_sha256: HASH, flow: "main",
    request: { path: "request.txt", bytes: 0, sha256: hashBytes(""), via } };
}

function turn(total: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { event: "turn", ts: TS, stage: "01-work", retry: 1, provider: "provider", model: "model",
    input: 0, output: total, cache_read: 0, cache_write: 0, total, stop: "stop", ...extra };
}

const stageStart = { event: "stage_start", ts: TS, stage: "01-work", retry: 1 };
const stageEnd = { event: "stage_end", ts: TS, stage: "01-work", retry: 1, exit: 0, cause: "success" };
const runEnd = { event: "run_end", ts: TS, exit: 0, cause: "success" };

function call(number: number, outcome: Record<string, unknown> = { exit: 0, cause: "success" }): Record<string, unknown> {
  const child = `stages/01-work/1/1/subflows/${String(number)}`;
  return { event: "subflow_call", ts: TS, stage: "01-work", retry: 1, call: number, flow: "child", depth: 1,
    input: { text: "", bytes: 0, sha256: hashBytes("") }, started: true, child, ...outcome };
}

async function writeChild(directory: string, number: number, events: Record<string, unknown>[], suffix = ""): Promise<string> {
  const reference = `stages/01-work/1/1/subflows/${String(number)}`, childDirectory = join(directory, reference);
  await mkdir(childDirectory, { recursive: true });
  await writeFile(join(childDirectory, "request.txt"), "");
  await writeFile(join(childDirectory, "record.jsonl"), `${currentRecord([
    { ...start(String(number), "subflow"), flow: "child" }, ...events,
  ])}${suffix}`);
  return childDirectory;
}

test("verified consumption distinguishes complete zero from partial prefixes and malformed turns", async () => {
  const zero = await rawRunDirectory([start(), runEnd]);
  await expect(readRunState(zero.home, zero.run)).resolves.toMatchObject({ tokens: 0, tokensStatus: "complete" });

  const prefix = await runDirectory([start(), stageStart, turn(7), turn(9, { cache_write: -1 })]);
  await expect(readRunState(prefix.home, prefix.run)).resolves.toMatchObject({ tokens: 7, tokensStatus: "partial", state: "crashed" });

  const unavailable = await runDirectory([]);
  await expect(readRunState(unavailable.home, unavailable.run)).resolves.toMatchObject({ tokens: null, tokensStatus: "partial" });
});

test("verified consumption follows an authorized child and keeps selected-root usage separate", async () => {
  const input = { text: "", bytes: 0, sha256: hashBytes("") };
  const child = "stages/01-work/1/1/subflows/1";
  const root = await runDirectory([
    start(), stageStart, turn(2),
    { event: "subflow_call", ts: TS, stage: "01-work", retry: 1, call: 1, flow: "child", depth: 1,
      input, started: true, child, exit: 0, cause: "success" },
    stageEnd, runEnd,
  ]);
  const childDirectory = join(root.directory, child);
  await mkdir(childDirectory, { recursive: true });
  await writeFile(join(childDirectory, "request.txt"), "");
  await writeFile(join(childDirectory, "record.jsonl"), currentRecord([
    { ...start("1", "subflow"), flow: "child" }, stageStart, turn(5), stageEnd, runEnd,
  ]));

  await expect(readRunState(root.home, root.run, true, true)).resolves.toMatchObject({
    tokens: 7, tokensStatus: "complete", usage: [{ total: 2 }],
  });
  const publicJson = await inspectRuns(root.home, { all: true, usage: true }, true);
  expect(JSON.parse(publicJson.output.toString())).toMatchObject({
    schemaVersion: 1, runs: [{ id: root.run, tokens: 7, tokensStatus: "complete", usage: [{ total: 2 }] }],
  });
  const publicHuman = await inspectRuns(root.home, { all: true }, false);
  expect(publicHuman.output.toString()).toMatch(new RegExp(`${TS}  0/success\\s+7  complete`, "u"));
});

test("unknown provider consumption and safe-integer overflow produce partial totals", async () => {
  const unmatched = await runDirectory([
    start(), stageStart,
    { event: "provider_start", ts: TS, stage: "01-work", retry: 1, provider: "provider", model: "model" },
    turn(3, { provider: "other" }), stageEnd, runEnd,
  ]);
  await expect(readRunState(unmatched.home, unmatched.run)).resolves.toMatchObject({ tokens: 3, tokensStatus: "partial" });

  const overflow = await runDirectory([start(), stageStart, turn(Number.MAX_SAFE_INTEGER), turn(1), stageEnd, runEnd]);
  await expect(readRunState(overflow.home, overflow.run)).resolves.toMatchObject({ tokens: null, tokensStatus: "partial" });
  const boundary = await rawRunDirectory([start(), stageStart, turn(Number.MAX_SAFE_INTEGER), stageEnd, runEnd]);
  await expect(readRunState(boundary.home, boundary.run)).resolves.toMatchObject({ tokens: Number.MAX_SAFE_INTEGER, tokensStatus: "complete" });
});

test("provider matching distinguishes omitted repeat from explicit repeat one", async () => {
  const held = await rawRunDirectory([
    start(), stageStart,
    { event: "provider_start", ts: TS, stage: "01-work", retry: 1, provider: "provider", model: "model" },
    { ...stageStart, repeat: 1 }, turn(3, { repeat: 1 }),
    { ...stageEnd, repeat: 1 }, stageEnd, runEnd,
  ]);
  await expect(readRunState(held.home, held.run)).resolves.toMatchObject({ tokens: 3, tokensStatus: "partial" });
});

test("record classification rejects an ending before its accepted start", async () => {
  const earlier = await runDirectory([
    { ...start(), ts: "2026-09-13T12:00:00.001Z" },
    { ...runEnd, ts: "2026-09-13T12:00:00.000Z" },
  ]);
  await expect(heldRecord(earlier.directory)).resolves.toMatchObject({ classification: "invalid", fault: { mark: "invalid" } });

  const equal = await runDirectory([start(), runEnd]);
  await expect(readRunState(equal.home, equal.run)).resolves.toMatchObject({ duration: 0, state: "ended" });
});

test("duration is unavailable when an accepted non-negative difference is not a safe integer", async () => {
  const startedAt = "-271821-04-20T00:00:00.000Z", endedAt = "+275760-09-13T00:00:00.000Z";
  const held = await rawRunDirectory([{ ...start(), ts: startedAt }, { ...runEnd, ts: endedAt }]);
  await expect(readRunState(held.home, held.run)).resolves.toMatchObject({ startedAt, endedAt, duration: null, state: "ended" });
});

test("never-started calls are complete while duplicate authorizations count no child", async () => {
  const never = await runDirectory([
    start(), stageStart, turn(2),
    { event: "subflow_call", ts: TS, stage: "01-work", retry: 1, call: 1, flow: "child", depth: 1, started: false },
    stageEnd, runEnd,
  ]);
  await expect(readRunState(never.home, never.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "complete" });

  const child = "stages/01-work/1/1/subflows/1", input = { text: "", bytes: 0, sha256: hashBytes("") };
  const call = { event: "subflow_call", ts: TS, stage: "01-work", retry: 1, call: 1, flow: "child", depth: 1,
    input, started: true, child, exit: 0, cause: "success" };
  const duplicate = await runDirectory([start(), stageStart, turn(2), call, call, stageEnd, runEnd]);
  await writeChild(duplicate.directory, 1, [stageStart, turn(5), stageEnd, runEnd]);
  await expect(readRunState(duplicate.home, duplicate.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "partial" });
});

test("an agreeing incomplete machinery child contributes its verified prefix", async () => {
  const child = "stages/01-work/1/1/subflows/1", input = { text: "", bytes: 0, sha256: hashBytes("") };
  const root = await runDirectory([
    start(), stageStart, turn(2),
    { event: "subflow_call", ts: TS, stage: "01-work", retry: 1, call: 1, flow: "child", depth: 1,
      input, started: true, child },
    { ...stageEnd, exit: 2, cause: "fault" }, { ...runEnd, exit: 2, cause: "fault" },
  ]);
  const childDirectory = join(root.directory, child);
  await mkdir(childDirectory, { recursive: true });
  await writeFile(join(childDirectory, "request.txt"), "");
  await writeFile(join(childDirectory, "record.jsonl"), currentRecord([
    { ...start("1", "subflow"), flow: "child" }, stageStart, turn(5),
  ]));
  await expect(readRunState(root.home, root.run)).resolves.toMatchObject({ tokens: 7, tokensStatus: "partial" });
});

test("nested grandchildren and sequential siblings are counted once in recorded call order", async () => {
  const nested = await runDirectory([start(), stageStart, turn(2), call(1), stageEnd, runEnd]);
  const childDirectory = await writeChild(nested.directory, 1, [stageStart, turn(5), call(1), stageEnd, runEnd]);
  await writeChild(childDirectory, 1, [stageStart, turn(7), stageEnd, runEnd]);
  await expect(readRunState(nested.home, nested.run)).resolves.toMatchObject({ tokens: 14, tokensStatus: "complete" });

  const siblings = await runDirectory([start(), stageStart, turn(2), call(1), call(2), stageEnd, runEnd]);
  await writeChild(siblings.directory, 1, [stageStart, turn(3), stageEnd, runEnd]);
  await writeChild(siblings.directory, 2, [stageStart, turn(4), stageEnd, runEnd]);
  await expect(readRunState(siblings.home, siblings.run)).resolves.toMatchObject({ tokens: 9, tokensStatus: "complete" });
});

test("fan-out child authorizations and cross-record overflow retain exact arithmetic", async () => {
  const first = { ...call(1), via: "fanout", item: "a" }, second = { ...call(2), via: "fanout", item: "b" };
  const fanoutStart = { event: "fanout_start", ts: TS, stage: "01-work", retry: 1 };
  const fanoutEnd = { event: "fanout_done", ts: TS, stage: "01-work", retry: 1, exit: 0, cause: "success" };
  const fanout = await runDirectory([start(), stageStart, turn(2), fanoutStart, first, second, fanoutEnd, stageEnd, runEnd]);
  await writeChild(fanout.directory, 1, [stageStart, turn(3), stageEnd, runEnd]);
  await writeChild(fanout.directory, 2, [stageStart, turn(4), stageEnd, runEnd]);
  await expect(readRunState(fanout.home, fanout.run)).resolves.toMatchObject({ tokens: 9, tokensStatus: "complete" });

  const overflow = await runDirectory([start(), stageStart, turn(Number.MAX_SAFE_INTEGER), call(1), stageEnd, runEnd]);
  await writeChild(overflow.directory, 1, [stageStart, turn(1), stageEnd, runEnd]);
  await expect(readRunState(overflow.home, overflow.run)).resolves.toMatchObject({ tokens: null, tokensStatus: "partial" });
});

test("a torn agreeing child retains its own verified descendant prefix", async () => {
  const root = await runDirectory([start(), stageStart, turn(2), call(1, {}),
    { ...stageEnd, exit: 2, cause: "fault" }, { ...runEnd, exit: 2, cause: "fault" }]);
  const childDirectory = await writeChild(root.directory, 1, [stageStart, turn(5), call(1)], "{\"torn\"");
  await writeChild(childDirectory, 1, [stageStart, turn(7), stageEnd, runEnd]);
  await expect(readRunState(root.home, root.run)).resolves.toMatchObject({ tokens: 14, tokensStatus: "partial" });
});

test("unreconciled root and descendant work retain only their verified totals", async () => {
  const unreconciled = { event: "unreconciled", ts: TS, stage: "01-work", retry: 1, started: TS, stopped: TS };
  const root = await runDirectory([start(), stageStart, turn(2), unreconciled, stageEnd, runEnd]);
  await expect(readRunState(root.home, root.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "partial" });

  const tree = await runDirectory([start(), stageStart, turn(2), call(1), stageEnd, runEnd]);
  await writeChild(tree.directory, 1, [stageStart, turn(5), unreconciled, stageEnd, runEnd]);
  await expect(readRunState(tree.home, tree.run)).resolves.toMatchObject({ tokens: 7, tokensStatus: "partial" });
});

test("provider starts match only later exact turns while historical turns remain complete", async () => {
  const providerStart = { event: "provider_start", ts: TS, stage: "01-work", retry: 1, provider: "provider", model: "model" };
  const ordered = await rawRunDirectory([start(), stageStart, turn(2), providerStart, turn(3), stageEnd, runEnd]);
  await expect(readRunState(ordered.home, ordered.run)).resolves.toMatchObject({ tokens: 5, tokensStatus: "complete" });
  const reversed = await rawRunDirectory([start(), stageStart, turn(2), providerStart, stageEnd, runEnd]);
  await expect(readRunState(reversed.home, reversed.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "partial" });
  const historical = await rawRunDirectory([start(), stageStart, turn(2), stageEnd, runEnd]);
  await expect(readRunState(historical.home, historical.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "complete" });
});

test.each([
  ["identity", (event: Record<string, unknown>) => ({ ...event, run: "wrong" }), (event: Record<string, unknown>) => event],
  ["flow", (event: Record<string, unknown>) => ({ ...event, flow: "wrong" }), (event: Record<string, unknown>) => event],
  ["request bytes", (event: Record<string, unknown>) => ({ ...event, request: { path: "request.txt", bytes: 1, sha256: hashBytes(""), via: "subflow" } }), (event: Record<string, unknown>) => event],
  ["request hash", (event: Record<string, unknown>) => ({ ...event, request: { path: "request.txt", bytes: 0, sha256: HASH, via: "subflow" } }), (event: Record<string, unknown>) => event],
  ["ending", (event: Record<string, unknown>) => event, (event: Record<string, unknown>) => ({ ...event, exit: 2, cause: "fault" })],
  ["chronology", (event: Record<string, unknown>) => ({ ...event, ts: "2026-09-13T12:00:00.001Z" }), (event: Record<string, unknown>) => ({ ...event, ts: TS })],
] as const)("a child with mismatched %s contributes no events", async (_name, changeStart, changeEnd) => {
  const root = await runDirectory([start(), stageStart, turn(2), call(1), stageEnd, runEnd]);
  const childDirectory = join(root.directory, "stages/01-work/1/1/subflows/1");
  await mkdir(childDirectory, { recursive: true });
  await writeFile(join(childDirectory, "request.txt"), "");
  await writeFile(join(childDirectory, "record.jsonl"), currentRecord([
    changeStart({ ...start("1", "subflow"), flow: "child" }), stageStart, turn(5), stageEnd, changeEnd(runEnd),
  ]));
  await expect(readRunState(root.home, root.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "partial" });
});

test.each(["missing", "invalid", "unsupported", "unreadable", "incomplete"])(
  "%s child state contributes no events",
  async (state) => {
    const root = await runDirectory([start(), stageStart, turn(2), call(1), stageEnd, runEnd]);
    const childDirectory = join(root.directory, "stages/01-work/1/1/subflows/1");
    if (state !== "missing") await mkdir(childDirectory, { recursive: true });
    if (state === "invalid") await writeFile(join(childDirectory, "record.jsonl"), "not json\n");
    if (state === "unsupported") await writeFile(join(childDirectory, "record.jsonl"), `${JSON.stringify({ ...start("1", "subflow"), record: 2 })}\n`);
    if (state === "unreadable") {
      const outside = join(root.directory, "outside-record");
      await writeFile(outside, "not a child record\n");
      await symlink(outside, join(childDirectory, "record.jsonl"));
    }
    if (state === "incomplete") {
      await writeFile(join(childDirectory, "request.txt"), "");
      await writeFile(join(childDirectory, "record.jsonl"), currentRecord([
        { ...start("1", "subflow"), flow: "child" }, stageStart, turn(5),
      ]));
    }
    await expect(readRunState(root.home, root.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "partial" });
  },
);

const malformedReferences: [string, Record<string, unknown>][] = [
  ["another attempt", { ...call(1), child: "stages/01-work/1/2/subflows/1" }],
  ["malformed started", { ...call(1), started: "true" }],
  ["false start carrying child", { ...call(1), started: false }],
];

test.each(malformedReferences)("a %s reference cannot authorize its on-disk child", async (_name, event) => {
  const root = await runDirectory([start(), stageStart, turn(2), event, stageEnd, runEnd]);
  const reference = String(event.child), childDirectory = join(root.directory, reference);
  await mkdir(childDirectory, { recursive: true });
  await writeFile(join(childDirectory, "request.txt"), "");
  await writeFile(join(childDirectory, "record.jsonl"), currentRecord([
    { ...start("1", "subflow"), flow: "child" }, stageStart, turn(5), stageEnd, runEnd,
  ]));
  await expect(readRunState(root.home, root.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "partial" });
});

test("conflicting references for one call slot authorize neither child", async () => {
  const conflict = { ...call(1), child: "stages/01-work/1/2/subflows/1" };
  const root = await runDirectory([start(), stageStart, turn(2), call(1), conflict, stageEnd, runEnd]);
  await writeChild(root.directory, 1, [stageStart, turn(5), stageEnd, runEnd]);
  const other = join(root.directory, conflict.child);
  await mkdir(other, { recursive: true });
  await writeFile(join(other, "request.txt"), "");
  await writeFile(join(other, "record.jsonl"), currentRecord([
    { ...start("1", "subflow"), flow: "child" }, stageStart, turn(7), stageEnd, runEnd,
  ]));
  await expect(readRunState(root.home, root.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "partial" });
});

// One ingestion ceiling governs a request from the moment it is written to the
// moment its record is read back (ticket 0281). A child born with a legal
// request is evidence, not an unreadable file, so its ancestor totals it.
async function largeRequestTree(size: number): Promise<{ home: string; run: string }> {
  const body = "a".repeat(size), reference = "stages/01-work/1/1/subflows/1";
  const descriptor = { path: `${reference}/request.txt`, bytes: size, sha256: hashBytes(body) };
  const root = await runDirectory([
    start(), stageStart, turn(2),
    { event: "subflow_call", ts: TS, stage: "01-work", retry: 1, call: 1, flow: "child", depth: 1,
      input: descriptor, started: true, child: reference, exit: 0, cause: "success" },
    stageEnd, runEnd,
  ]);
  const childDirectory = join(root.directory, reference);
  await mkdir(childDirectory, { recursive: true });
  await writeFile(join(childDirectory, "request.txt"), body);
  await writeFile(join(childDirectory, "record.jsonl"), currentRecord([
    { record: 1, event: "run_start", ts: TS, run: "1", assembly: "review", assembly_sha256: HASH, flow: "child",
      request: { path: "request.txt", bytes: size, sha256: hashBytes(body), via: "subflow" } },
    stageStart, turn(5), stageEnd, runEnd,
  ]));
  return { home: root.home, run: root.run };
}

test("a child request of any admitted size is verified and one above the limit is refused", async () => {
  const admitted = await largeRequestTree(2 * 1024 * 1024);
  await expect(readRunState(admitted.home, admitted.run)).resolves.toMatchObject({ tokens: 7, tokensStatus: "complete" });

  const refused = await largeRequestTree(4 * 1024 * 1024 + 1);
  await expect(readRunState(refused.home, refused.run)).resolves.toMatchObject({ tokens: 2, tokensStatus: "partial" });
});
