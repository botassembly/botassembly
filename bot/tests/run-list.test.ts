import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { runEndEvent, runStartEvent } from "../src/record-events.ts";
import { currentRecord, successfulStageEvents } from "./current-record.ts";
import { invokeCli } from "./invoke.ts";
import { lockRun } from "../src/inspection.ts";
import type { Cause } from "../src/spine.ts";
import { mapping } from "../src/model.ts";

const roots: string[] = [];
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const HASH = "a".repeat(64);
const REQUEST = { path: "request.txt", sha256: HASH, bytes: 0, via: "argument" };
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function object(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!mapping(value)) throw new Error("Expected a JSON object.");
  return value;
}

function child(value: Record<string, unknown>, name: string): Record<string, unknown> {
  const held = value[name];
  if (!mapping(held)) throw new Error(`Expected ${name} object.`);
  return held;
}

function rows(value: Record<string, unknown>): Record<string, unknown>[] {
  const held = value["data"];
  return Array.isArray(held) ? held.filter(mapping) : [];
}

function next(value: Record<string, unknown>): string {
  const held = child(value, "page")["next"];
  if (typeof held !== "string") throw new Error("Expected a continuation cursor.");
  return held;
}

function id(index: number): string {
  return `2026-09-05T12-${String(index).padStart(2, "0")}-00-${String(index).padStart(4, "0")}`;
}

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-run-list-"));
  roots.push(root);
  const held = join(root, "home");
  await mkdir(join(held, "runs"), { recursive: true });
  return held;
}

async function ended(where: string, index: number, assembly = "review", flow = "main", cause: Cause = "success", endedAt?: string): Promise<string> {
  const run = id(index);
  const ts = `2026-09-05T12:${String(index).padStart(2, "0")}:00.000Z`;
  const exit = cause === "success" ? 0 : cause === "fault" ? 2 : 1;
  const events = [
    runStartEvent({ ts, run, assembly, assemblyHash: HASH, flow, request: REQUEST }),
    ...successfulStageEvents({ stage: "01-work", retry: 1 }, `2026-09-05T12:${String(index).padStart(2, "0")}:01`),
    runEndEvent({ ts: endedAt ?? ts, exit, cause }),
  ];
  await mkdir(join(where, "runs", run));
  await writeFile(join(where, "runs", run, "record.jsonl"), currentRecord(events));
  return run;
}

test("run list gives people the newest twenty rows and leaves legacy runs byte-identical", async () => {
  const where = await home();
  for (let index = 0; index < 21; index += 1) await ended(where, index);
  const before = await invokeCli(["run", "list", "--all", "--json"], { home: where });
  const listed = await invokeCli(["run", "list"], { home: where });
  const after = await invokeCli(["run", "list", "--all", "--json"], { home: where });
  expect(listed.code, listed.err).toBe(0);
  expect(listed.out.split("\n")[0]).toBe("| id | assembly | flow | startedAt | endedAt | duration | state | exit | cause | tokens |");
  expect(listed.out).toContain(id(20));
  expect(listed.out).not.toContain(id(0));
  expect(after.out).toBe(before.out);
  expect(after.err).toBe(before.err);
});

test("run list JSON modes are identical and empty valid results succeed", async () => {
  const where = await home();
  await ended(where, 1);
  const long = await invokeCli(["run", "list", "--json"], { home: where });
  const short = await invokeCli(["run", "list", "-j"], { home: where });
  expect(short).toEqual(long);
  expect(object(long.out)).toMatchObject({
    schemaVersion: 1, kind: "bot.run.list",
    data: [{ id: id(1), state: "ended", exit: 0, cause: "success", tokens: 2 }],
    page: { limit: 20, next: null, through: id(1), complete: true },
    summary: { returned: 1, matched: null }, warnings: [],
  });
  const empty = await invokeCli(["run", "list", "--assembly", "absent", "-j"], { home: where });
  expect(empty.code).toBe(0);
  expect(rows(object(empty.out))).toEqual([]);
  expect(empty.err).toBe("");
});

test("run list carries exact retained end times and signed durations in either projection", async () => {
  const where = await home();
  await ended(where, 1, "review", "main", "success", "2026-09-05T12:01:01.234Z");
  await ended(where, 2, "review", "main", "rejected", "2026-09-05T12:01:59.500Z");

  const defaultJson = await invokeCli(["run", "list", "-j"], { home: where, now: "2099-01-01T00:00:00.000Z" });
  const defaultHuman = await invokeCli(["run", "list"], { home: where, now: "2099-01-01T00:00:00.000Z" });
  const endedProjection = await invokeCli(["run", "list", "--fields", "endedAt", "-j"], { home: where });
  const durationProjection = await invokeCli(["run", "list", "--fields", "duration", "-j"], { home: where });
  const defaults = rows(object(defaultJson.out));
  expect({
    defaultFields: Object.keys(defaults[0] ?? {}),
    markdownHeading: defaultHuman.out.split("\n")[0],
    endedAtExit: endedProjection.code,
    durationExit: durationProjection.code,
  }).toEqual({
    defaultFields: ["id", "assembly", "flow", "startedAt", "endedAt", "duration", "state", "exit", "cause", "tokens"],
    markdownHeading: "| id | assembly | flow | startedAt | endedAt | duration | state | exit | cause | tokens |",
    endedAtExit: 0,
    durationExit: 0,
  });
  expect(defaults).toEqual([
    expect.objectContaining({ id: id(2), endedAt: "2026-09-05T12:01:59.500Z", duration: -500, exit: 1, cause: "rejected" }),
    expect.objectContaining({ id: id(1), endedAt: "2026-09-05T12:01:01.234Z", duration: 1_234, exit: 0, cause: "success" }),
  ]);
  expect(typeof defaults[0]?.["endedAt"]).toBe("string");
  expect(typeof defaults[0]?.["duration"]).toBe("number");

  const projected = rows(object((await invokeCli([
    "run", "list", "--fields", "duration,endedAt,id", "-j",
  ], { home: where })).out));
  expect(Object.keys(projected[0] ?? {})).toEqual(["duration", "endedAt", "id"]);
  expect(projected[0]).toEqual({ duration: -500, endedAt: "2026-09-05T12:01:59.500Z", id: id(2) });

  const human = await invokeCli(["run", "list", "--fields", "endedAt,duration", "--limit", "1"], {
    home: where, now: "2026-09-05T12:05:00.000Z",
  });
  expect(human.out).toBe("| endedAt | duration |\n| --- | --- |\n| 3m | -500ms |\n");
});

test("repeatable filters use OR within a name and AND across names with inclusive recorded times", async () => {
  const where = await home();
  await ended(where, 1, "alpha", "main");
  await ended(where, 2, "beta", "other");
  await ended(where, 3, "gamma", "main", "rejected");
  const held = await invokeCli(["run", "list", "--assembly", "alpha", "--assembly", "gamma", "--flow", "main",
    "--state", "ended", "--cause", "success", "--cause", "rejected", "--since", "2026-09-05T12:01:00.000Z",
    "--until", "2026-09-05T12:03:00.000Z", "-j"], { home: where });
  expect(held.code, held.err).toBe(0);
  expect(rows(object(held.out)).map((row) => row["id"])).toEqual([id(3), id(1)]);

  const invalid = await invokeCli(["run", "list", "--since", "2026-02-30T00:00:00Z", "-j"], { home: join(where, "absent") });
  expect(invalid.code).toBe(2);
  expect(child(object(invalid.err), "error")).toMatchObject({ code: "request-invalid", cause: "timestamp-invalid" });
});

test("run list bounds filters and accepts only canonical writer timestamps before reading a home", async () => {
  const absent = join(tmpdir(), "bot-run-list-absent");
  const tooMany = Array.from({ length: 65 }, (_, index) => ["--assembly", `a${String(index)}`]).flat();
  for (const args of [
    tooMany,
    ["--assembly", "x".repeat(2_049)],
    ["--assembly", "has\ncontrol"],
    ["--since", "2026-09-05T08:00:00.000-04:00"],
    ["--since", "2026-09-05T12:00:00Z"],
    ["--since", "0099-09-05T12:00:00.000Z"],
  ]) {
    const held = await invokeCli(["run", "list", ...args, "-j"], { home: absent });
    expect(held.code).toBe(2);
  }
  const accepted = await invokeCli(["run", "list", "--since", "0100-01-01T00:00:00.000Z", "-j"], { home: absent });
  expect(accepted.code).toBe(1);
  expect(child(object(accepted.err), "error")["code"]).toBe("home-not-found");
  const upper = await invokeCli(["run", "list", "--until", "9999-12-31T23:59:59.999Z", "-j"], { home: absent });
  expect(upper.code).toBe(1);
});

test("a cursor pages stable membership and conflicts on changes at or below through", async () => {
  const where = await home();
  for (let index = 1; index <= 4; index += 1) await ended(where, index);
  const first = object((await invokeCli(["run", "list", "--limit", "1", "-j"], { home: where })).out);
  expect(rows(first).map((row) => row["id"])).toEqual([id(4)]);
  expect(typeof next(first)).toBe("string");
  expect(Buffer.from(next(first), "base64url").toString("utf8")).not.toContain(where);
  await ended(where, 9);
  const second = object((await invokeCli(["run", "list", "--limit", "2", "--after", next(first), "-j"], { home: where })).out);
  expect(rows(second).map((row) => row["id"])).toEqual([id(3), id(2)]);
  expect(rows(second).some((row) => row["id"] === id(9))).toBe(false);

  const changed = await home();
  for (let index = 1; index <= 3; index += 1) await ended(changed, index);
  const page = object((await invokeCli(["run", "list", "--limit", "1", "-j"], { home: changed })).out);
  await mkdir(join(changed, "runs", id(0)));
  const conflict = await invokeCli(["run", "list", "--after", next(page), "-j"], { home: changed });
  expect(conflict.code).toBe(3);
  expect(child(object(conflict.err), "error")["code"]).toBe("cursor-conflict");
  const another = await home();
  const wrongHome = await invokeCli(["run", "list", "--after", next(page), "-j"], { home: another });
  expect(wrongHome.code).toBe(3);
  const wrongFilter = await invokeCli(["run", "list", "--assembly", "review", "--after", next(page), "-j"], { home: changed });
  expect(wrongFilter.code).toBe(3);
  const malformed = await invokeCli(["run", "list", "--after", "not-a-cursor", "-j"], { home: changed });
  expect(malformed.code).toBe(2);
  expect(child(object(malformed.err), "error")["code"]).toBe("cursor-invalid");
  const oversized = await invokeCli(["run", "list", "--after", "a".repeat(8_193), "-j"], { home: changed });
  expect(oversized.code).toBe(2);

  const canonical = Buffer.from(next(page), "base64url").toString("utf8");
  const invalidCursors = [
    "*", Buffer.from([0xff]).toString("base64url"), Buffer.from("{").toString("base64url"),
    Buffer.from(canonical.replace('"version":1', '"version":1,"version":1')).toString("base64url"),
    Buffer.from(canonical.replace("{", '{"unknown":true,')).toString("base64url"),
    Buffer.from(canonical.replace('"version":1', '"version":2')).toString("base64url"),
    Buffer.from(` ${canonical}`).toString("base64url"), Buffer.from("[]").toString("base64url"),
  ];
  for (const invalidCursor of invalidCursors) {
    const invalid = await invokeCli(["run", "list", "--after", invalidCursor, "-j"], { home: changed });
    expect(invalid.code).toBe(2);
    expect(child(object(invalid.err), "error")).toMatchObject({ code: "cursor-invalid", cause: "cursor-malformed" });
  }
});

test("a maximal filter cursor survives one real process argument round trip", async () => {
  const where = await home();
  await ended(where, 1);
  await ended(where, 2);
  const values = ["review", ...Array.from({ length: 63 }, (_, index) => `${String(index).padStart(2, "0")}-${"x".repeat(index === 0 ? 55 : 29)}`)];
  const filters = values.flatMap((value) => ["--assembly", value]);
  const env = { ...process.env, BOT_HOME: where };
  const first = spawnSync("node", [CLI, "run", "list", ...filters, "--limit", "1", "-j"], { env, encoding: "utf8" });
  expect(first.status, first.stderr).toBe(0);
  const cursor = next(object(first.stdout));
  expect(Buffer.byteLength(cursor)).toBeLessThanOrEqual(8_192);
  const second = spawnSync("node", [CLI, "run", "list", ...filters, "--after", cursor, "-j"], { env, encoding: "utf8" });
  expect(second.status, second.stderr).toBe(0);
  expect(rows(object(second.stdout)).map((row) => row["id"])).toEqual([id(1)]);
});

test("a cursor conflicts when an existing member is removed or renamed", async () => {
  const where = await home();
  for (let index = 1; index <= 3; index += 1) await ended(where, index);
  const page = object((await invokeCli(["run", "list", "--limit", "1", "-j"], { home: where })).out);
  await rename(join(where, "runs", id(1)), join(where, "runs", id(0)));
  const held = await invokeCli(["run", "list", "--after", next(page), "-j"], { home: where });
  expect(held.code).toBe(3);
  expect(child(object(held.err), "error")["cause"]).toBe("membership-changed");
});

test("sparse pages advance after the last examined id and finish without repeats", async () => {
  const where = await home();
  for (let index = 0; index < 8; index += 1) await ended(where, index, index % 3 === 0 ? "wanted" : "other");
  const seen: string[] = [];
  let after: string | null = null;
  let complete = false;
  while (!complete) {
    const args = ["run", "list", "--assembly", "wanted", "--limit", "1", "-j"];
    if (after !== null) args.push("--after", after);
    const page = object((await invokeCli(args, { home: where })).out);
    seen.push(...rows(page).map((row) => String(row["id"])));
    const pageFacts = child(page, "page");
    after = typeof pageFacts["next"] === "string" ? pageFacts["next"] : null;
    complete = pageFacts["complete"] === true;
  }
  expect(seen).toEqual([id(6), id(3), id(0)]);
  expect(new Set(seen).size).toBe(seen.length);
});

test("field projection controls JSON and Markdown but never suppresses invalid-record warnings", async () => {
  const where = await home();
  await mkdir(join(where, "runs", id(1)));
  await writeFile(join(where, "runs", id(1), "record.jsonl"), "not json\n");
  const json = await invokeCli(["run", "list", "--fields", "id,state", "-j"], { home: where });
  expect(Object.keys(rows(object(json.out))[0] ?? {})).toEqual(["id", "state"]);
  expect(object(json.out)["warnings"]).toEqual([expect.objectContaining({ id: id(1), code: "invalid" })]);
  const human = await invokeCli(["run", "list", "--fields", "id,state"], { home: where });
  expect(human.out.split("\n")[0]).toBe("| id | state |");
  expect(human.err).toContain(`${id(1)}: invalid:`);
  for (const value of ["", "id,id", "id,cost"]) {
    const bad = await invokeCli(["run", "list", "--fields", value, "-j"], { home: where });
    expect(bad.code).toBe(2);
  }
});

test("count returns no rows and the exact filtered count without reading detail artifacts", async () => {
  const where = await home();
  await ended(where, 1, "wanted");
  await ended(where, 2, "other");
  await writeFile(join(where, "runs", id(1), "session.jsonl"), "detail must stay unread\n");
  const counted = await invokeCli(["run", "list", "--assembly", "wanted", "--count", "-j"], { home: where });
  expect(object(counted.out)).toMatchObject({ data: [], page: { limit: 0, next: null, complete: true }, summary: { returned: 0, matched: 1 } });
  for (const option of [["--limit", "1"], ["--after", "cursor"], ["--fields", "id"]]) {
    const bad = await invokeCli(["run", "list", "--count", ...option, "-j"], { home: where });
    expect(bad.code).toBe(2);
  }
});

test("count streams five hundred warnings through one bounded warning set", async () => {
  const where = await home();
  await Promise.all(Array.from({ length: 500 }, async (_, index) => {
    const name = `invalid-${String(index).padStart(4, "0")}`;
    await mkdir(join(where, "runs", name));
    await writeFile(join(where, "runs", name, "record.jsonl"), "not json\n");
  }));
  const held = object((await invokeCli(["run", "list", "--count", "-j"], { home: where })).out);
  expect(rows(held)).toEqual([]);
  expect(child(held, "summary")).toMatchObject({ matched: 500, warningCount: 500, warningsOmitted: 480 });
  expect(held["warnings"]).toHaveLength(20);
  const human = await invokeCli(["run", "list", "--count"], { home: where });
  expect(human.err.trimEnd().split("\n")).toHaveLength(21);
  expect(human.err).toContain("480 warnings omitted.");
});

test("run list gives every retained record shape its distinct structured state", async () => {
  const where = await home();
  await ended(where, 1);
  const startOnly = async (index: number) => {
    const run = id(index), directory = join(where, "runs", run);
    await mkdir(directory);
    const first = currentRecord([runStartEvent({
      ts: `2026-09-05T12:${String(index).padStart(2, "0")}:00.000Z`, run, assembly: "review", assemblyHash: HASH, flow: "main", request: REQUEST,
    })]).split("\n")[0] ?? "";
    await writeFile(join(directory, "record.jsonl"), `${first}\n`);
    return directory;
  };
  await startOnly(2);
  const running = await startOnly(3);
  const release = lockRun(running);
  const unborn = join(where, "runs", id(0));
  await mkdir(unborn);
  const releaseUnborn = lockRun(unborn);
  await mkdir(join(where, "runs", id(4)));
  await writeFile(join(where, "runs", id(4), "record.jsonl"), "");
  await mkdir(join(where, "runs", id(5)));
  await writeFile(join(where, "runs", id(5), "record.jsonl"), "not json\n");
  await mkdir(join(where, "runs", id(6)));
  await mkdir(join(where, "runs", id(7)));
  await writeFile(join(where, "runs", id(7), "record.jsonl"), Buffer.from([0xff, 0x0a]));
  await mkdir(join(where, "runs", id(8)));
  await writeFile(join(where, "runs", id(8), "record.jsonl"), `${JSON.stringify({ record: 2, runtime: "old", ts: "2026-09-05T12:08:00.000Z", event: "run_start" })}\n`);
  await mkdir(join(where, "runs", id(9)));
  const outside = join(where, "outside-record.jsonl");
  await writeFile(outside, "outside\n");
  await symlink(outside, join(where, "runs", id(9), "record.jsonl"));
  const held = await invokeCli(["run", "list", "-j"], { home: where });
  release();
  releaseUnborn();
  const states = Object.fromEntries(rows(object(held.out)).map((row) => [String(row["id"]), row["state"]]));
  expect(states).toMatchObject({
    [id(1)]: "ended", [id(2)]: "crashed", [id(3)]: "running", [id(4)]: "incomplete", [id(5)]: "invalid",
    [id(6)]: "no-record", [id(7)]: "bad-record", [id(8)]: "bad-version", [id(9)]: "unreadable",
  });
  expect(states[id(0)]).toBeUndefined();
  for (const row of rows(object(held.out)).filter((row) => row["state"] !== "ended")) {
    expect(row).toMatchObject({ endedAt: null, duration: null });
  }
  const unavailable = await invokeCli(["run", "list", "--fields", "id,endedAt,duration"], { home: where });
  for (const run of [id(2), id(9)]) expect(unavailable.out).toContain(`| ${run} | - | - |`);
});

test("Markdown renders hostile retained text as bounded inert cells", async () => {
  const where = await home();
  const exact = `<script>\\|line\n\u001b[31m${"x".repeat(600)}`;
  await ended(where, 1, "x".repeat(1_100));
  await ended(where, 2, exact);
  const hostileId = "\\".repeat(250);
  await mkdir(join(where, "runs", hostileId));
  await writeFile(join(where, "runs", hostileId, "record.jsonl"), "not json\n");
  const json = object((await invokeCli(["run", "list", "-j"], { home: where })).out);
  expect(rows(json).find((row) => row["id"] === id(1))?.["assembly"]).toBeNull();
  expect(rows(json).find((row) => row["id"] === id(2))?.["assembly"]).toBe(exact);
  expect(child(json, "summary")["warningCount"]).toBe(4);
  expect(rows(json).find((row) => row["id"] === hostileId)?.["id"]).toBe(hostileId);
  const warningFacts = Array.isArray(json["warnings"]) ? json["warnings"].filter(mapping) : [];
  expect(warningFacts.some((held) => held["id"] === hostileId && held["code"] === "cell-truncated"
    && typeof held["diagnostic"] === "string" && /field id omits \d+ escaped bytes/u.test(held["diagnostic"]))).toBe(true);
  expect(warningFacts.some((held) => held["id"] === id(2) && held["code"] === "cell-truncated"
    && typeof held["diagnostic"] === "string" && /field assembly omits \d+ escaped bytes/u.test(held["diagnostic"]))).toBe(true);
  const human = await invokeCli(["run", "list"], { home: where });
  expect(human.out).not.toContain("<script>");
  expect(human.out).toContain("\\\\\\|");
  expect(Buffer.byteLength(human.out)).toBeLessThan(1_048_576);
  expect(human.out.split("\n").filter(Boolean).every((line) => Buffer.byteLength(line) <= 4_096)).toBe(true);
  expect(human.err.split("\n").filter(Boolean).every((line) => Buffer.byteLength(line) <= 1_024)).toBe(true);
});

test("structured and human failures use their requested channel and home precedence stays explicit", async () => {
  const where = await home();
  await ended(where, 1);
  const json = await invokeCli(["run", "list", "--field", "id", "-j"], { home: where });
  expect(json.code).toBe(2);
  expect(json.out).toBe("");
  expect(child(object(json.err), "error")).toMatchObject({ code: "request-invalid", operation: "run.list", cause: "argument-unknown", retryable: false, details: { argument: "--field" } });
  const human = await invokeCli(["run", "list", "--field", "id"], { home: where });
  expect(human.code).toBe(2);
  expect(human.out).toBe("");
  expect(human.err.length).toBeLessThanOrEqual(2_049);
  const hostile = await invokeCli(["run", "list", `--<script>\\|bad\n${"x".repeat(3_000)}`], { home: where });
  expect(hostile.code).toBe(2);
  expect(hostile.out).toBe("");
  expect(hostile.err.split("\n")).toHaveLength(2);
  expect(Buffer.byteLength(hostile.err)).toBeLessThanOrEqual(2_049);
  expect(hostile.err).not.toContain("<script>");
  const absent = await invokeCli(["run", "list", "-j"], { home: join(where, "absent") });
  expect(absent.code).toBe(1);
  expect(child(object(absent.err), "error")["code"]).toBe("home-not-found");
  const explicit = await invokeCli(["run", "list", "--home", where, "-j"], { home: join(where, "wrong") });
  expect(rows(object(explicit.out))).toHaveLength(1);
  const file = join(where, "file-home");
  await writeFile(file, "not a home");
  const badHome = await invokeCli(["run", "list", "-j"], { home: file });
  expect(badHome.code).toBe(1);
  expect(child(object(badHome.err), "error")).toMatchObject({ code: "home-invalid", cause: "path-not-directory" });
  const badRuns = await home();
  await rm(join(badRuns, "runs"), { recursive: true });
  await writeFile(join(badRuns, "runs"), "not a directory");
  const dependency = await invokeCli(["run", "list", "-j"], { home: badRuns });
  expect(dependency.code).toBe(4);
});

test("run list help names the complete network-free surface while legacy run help stays unchanged", async () => {
  const where = await home();
  const before = await invokeCli(["run", "start", "--help"], { home: where });
  const help = await invokeCli(["run", "list", "--help"], { home: where });
  const after = await invokeCli(["run", "start", "--help"], { home: where });
  expect(help.code).toBe(0);
  for (const word of ["--assembly", "--flow", "--state", "--cause", "--since", "--until", "--limit", "--after", "--fields", "endedAt", "duration", "--count", "--json", "-j", "--home", "64", "2,048", "8,192", "YYYY-MM-DDTHH:mm:ss.sssZ", "without network access"]) expect(help.out).toContain(word);
  expect(help.out).not.toContain("bot runs");
  expect(after.out).toBe(before.out);
});
