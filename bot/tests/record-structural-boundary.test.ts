import { describe, expect, test } from "vitest";
import { classifyStory } from "../src/record-story.ts";

const RUN = "2026-09-04T10-00-00-a001";
const TS = "2026-09-04T10:00:00.000Z";
const HASH = "a".repeat(64);
const start = { ts: TS, event: "run_start", record: 1, runtime: "bot", run: RUN, assembly: "x", assembly_hash: HASH, flow: "main", request: { path: "request.txt", sha256: HASH, bytes: 1, via: "argument" } };
const identity = { stage: "01-work", retry: 1 };
const opened = { ts: TS, event: "stage_start", ...identity, received: [], options: [] };
const providerStart = { ts: TS, event: "provider_start", ...identity, provider: "p", model: "m" };
const turn = { ts: TS, event: "turn", ...identity, provider: "p", model: "m", input: 1, output: 1, cache_read: 0, cache_write: 0, total: 2, stop: "stop" };
const ended = { ts: TS, event: "stage_end", ...identity, exit: 0, cause: "success", output: { path: "stages/01-work/1/1/output.txt", sha256: HASH }, sealed: true, judged: true };
const runEnd = { ts: TS, event: "run_end", exit: 0, cause: "success" };
const signal = { ts: TS, event: "signal", signal: 15, name: "SIGTERM" };

type Expected = "valid" | "incomplete" | "invalid";

describe.each([
  ["accepts a complete possible story", [start, opened, turn, ended, runEnd], "valid"],
  ["keeps a possible prefix incomplete", [start, opened, turn], "incomplete"],
  ["rejects content after run_end", [start, opened, turn, ended, runEnd, signal], "invalid"],
  ["rejects duplicate run_end", [start, opened, turn, ended, runEnd, runEnd], "invalid"],
  ["rejects stage_end before its start", [start, ended, runEnd], "invalid"],
  ["rejects provider_start outside an open stage attempt", [start, providerStart], "invalid"],
  ["rejects provider_start with a malformed stage identity", [start, opened, { ...providerStart, retry: 0 }], "invalid"],
  ["rejects successful run_end with open work", [start, opened, turn, runEnd], "invalid"],
  ["rejects run_start after another event", [opened, start], "invalid"],
  ["rejects two run_start events", [start, start], "invalid"],
  ["rejects a transplanted record", [{ ...start, run: "other" }], "invalid"],
  ["rejects signal with an ordinary exit", [start, opened, turn, { ...ended, exit: 2, cause: "signal" }], "invalid"],
  ["rejects a signal outcome without a signal event", [start, opened, turn, { ...ended, exit: 143, cause: "signal" }, { ...runEnd, exit: 143, cause: "signal" }], "invalid"],
  ["accepts a terminal signal fact before its queued signal event", [start, opened, turn, { ...ended, exit: 143, cause: "signal" }, signal, { ...runEnd, exit: 143, cause: "signal" }], "valid"],
  ["rejects a run ending that ignores an observed signal", [start, opened, turn, ended, signal, runEnd], "invalid"],
  ["rejects contradictory terminal cause and exit", [start, opened, turn, { ...ended, exit: 1 }, runEnd], "invalid"],
  ["rejects an unknown event", [start, { ts: TS, event: "fanout_done" }], "invalid"],
  ["accepts a retry after an unclosed failed attempt", [start, opened, turn, { ts: TS, event: "check", ...identity, check: "output", exit: 1, capture: "c" }, { ...opened, retry: 2 }, { ...turn, retry: 2 }, { ...ended, retry: 2 }, runEnd], "valid"],
  ["accepts machinery fault closing open work", [start, opened, turn, { ...runEnd, exit: 2, cause: "fault" }], "valid"],
  ["accepts historical gate check without gate_start", [start, opened, turn, { ts: TS, event: "check", ...identity, check: "gate", exit: 0, capture: "c", file: "gate.sh", sha256: HASH }, ended, runEnd], "valid"],
  ["accepts historical run_start without newer provenance", [start, opened, turn, ended, runEnd], "valid"],
  ["accepts historical provenance without the observed source tree", [{ ...start, runtime_source: "checkout", runtime_digest: HASH,
    lock_sha256: HASH, node: "v22", provider_adapter: "pi@old" }, opened, turn, ended, runEnd], "valid"],
  ["accepts the historical mark event shape", [start, opened, { ts: TS, event: "tool_call", ...identity, tool: "mark", decision: "done", item: "1" }, turn, ended, runEnd], "valid"],
  ["accepts one completed FANOUT story", [
    start,
    { ts: TS, event: "fanout_start", ...identity },
    { ts: TS, event: "subflow_call", ...identity, via: "fanout", item: "a", call: 1, flow: "worker", depth: 1, started: false },
    { ts: TS, event: "fanout_done", ...identity, exit: 0, cause: "success" },
    runEnd,
  ], "valid"],
  ["rejects fanout_done before fanout_start", [start, { ts: TS, event: "fanout_done", ...identity, exit: 0, cause: "success" }], "invalid"],
  ["rejects successful run_end while FANOUT remains open", [start, { ts: TS, event: "fanout_start", ...identity }, runEnd], "invalid"],
] satisfies [string, Record<string, unknown>[], Expected][])('%s', (_name, events, expected) => {
  test(`classifies the story as ${expected}`, () => {
    expect(classifyStory(events, undefined, RUN).classification).toBe(expected);
  });
});
