import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { inspectExplain } from "../src/one-run.ts";
import { mapping } from "../src/model.ts";
import { heldRecord } from "../src/record-lines.ts";
import { currentRecord } from "./current-record.ts";
import { invokeCli, invokeCliBytes } from "./invoke.ts";

const roots: string[] = [];
const RUN = "2026-09-13T12-00-00-legacy-access";
const TS = "2026-09-13T12:00:00.000Z";
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

function legacyEvents(): Record<string, unknown>[] {
  return [
    { record: 1, event: "run_start", run: RUN, assembly: "demo", flow: "main", ts: TS },
    { event: "stage_start", stage: "01-work", retry: 1, ts: TS, access: { read: ["INPUT"], bash: ["git"] } },
    { event: "turn", stage: "01-work", retry: 1, ts: TS, provider: "faux", model: "faux-1",
      input: 1, output: 1, cache_read: 0, cache_write: 0, total: 2, stop: "toolUse" },
    { event: "tool_denied", stage: "01-work", retry: 1, ts: TS, tool: "write", boundary: "PWD" },
    { event: "stage_end", stage: "01-work", retry: 1, ts: TS, exit: 1, cause: "rejected",
      output: { path: "stages/01-work/1/1/output.txt", sha256: EMPTY_SHA256 }, sealed: false, judged: true },
    { event: "run_end", ts: TS, exit: 1, cause: "rejected" },
  ];
}

async function fixture(events = legacyEvents()): Promise<{ home: string; directory: string; bytes: Buffer }> {
  const home = await mkdtemp(join(tmpdir(), "bot-legacy-access-record-")); roots.push(home);
  const directory = join(home, "runs", RUN), bytes = Buffer.from(currentRecord(events));
  await mkdir(join(directory, "stages/01-work/1/1"), { recursive: true });
  await writeFile(join(directory, "stages/01-work/1/1/output.txt"), "");
  await writeFile(join(directory, "record.jsonl"), bytes);
  return { home, directory, bytes };
}

test("every public record reading keeps historical access and denial evidence readable", async () => {
  const held = await fixture();
  await expect(heldRecord(held.directory)).resolves.toMatchObject({ classification: "valid" });

  const human = await invokeCli(["run", "events", RUN], { home: held.home });
  expect(human.code).toBe(0);
  expect(human.out).toContain("write denied at PWD boundary");
  const json = await invokeCli(["run", "events", RUN, "--json"], { home: held.home });
  expect(json.code).toBe(0);
  const parsed: unknown = JSON.parse(json.out);
  expect(mapping(parsed) && mapping(parsed["data"])).toBe(true);
  if (!mapping(parsed) || !mapping(parsed["data"])) throw new Error("Expected events JSON.");
  expect(parsed["data"]["events"]).toEqual(expect.arrayContaining([
    expect.objectContaining({ event: "stage_start", access: { read: ["INPUT"], bash: ["git"] } }),
    expect.objectContaining({ event: "tool_denied", tool: "write", boundary: "PWD" }),
  ]));

  const show = await invokeCli(["run", "show", RUN, "--json"], { home: held.home });
  expect(show.code).toBe(0);
  const raw = await invokeCliBytes(["run", "record", RUN, "--raw"], { home: held.home });
  expect(raw).toEqual({ code: 0, out: held.bytes, err: Buffer.alloc(0) });

  const explanation = await inspectExplain(held.home, RUN, undefined, true);
  expect(explanation.exitCode).toBe(0);
  expect(JSON.parse(explanation.output.toString())).toMatchObject({ stages: [{
    access: { read: ["INPUT"], bash: ["git"] },
    deniedCalls: { total: 1, byTool: { write: 1 }, byBoundary: { PWD: 1 } },
  }] });
});

test.each([
  ["unknown event", { event: "access_denied", stage: "01-work", retry: 1, ts: TS }, "unknown event"],
  ["malformed access", { event: "stage_start", stage: "01-work", retry: 1, ts: TS, access: { invented: ["INPUT"] } }, "malformed historical access"],
  ["malformed denial", { event: "tool_denied", stage: "01-work", retry: 1, ts: TS, tool: "", boundary: "PWD" }, "requires tool and boundary"],
] as const)("the operational reader rejects %s", async (_name, event, rule) => {
  const events = legacyEvents();
  if (event.event === "stage_start") events[1] = event;
  else events.splice(3, 0, event);
  const held = await fixture(events);
  const record = await heldRecord(held.directory);
  expect(record?.fault?.says).toContain(rule);
});

test("a denial outside its stage attempt remains structurally invalid", async () => {
  const events = legacyEvents();
  const denial = events.splice(3, 1)[0];
  if (denial !== undefined) events.splice(4, 0, denial);
  const held = await fixture(events);
  const record = await heldRecord(held.directory);
  expect(record?.fault?.says).toContain("tool_denied outside an open stage attempt");
});
