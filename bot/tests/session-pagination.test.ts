import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { visitHeldRunLines, visitHeldSessionLines } from "../src/session-lines.ts";
import { currentRecord, successfulStageEvents } from "./current-record.ts";
import { invokeCli } from "./invoke.ts";

const roots: string[] = [];
const RUN = "2026-09-05T14-00-00-page";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function entry(index: number, text = `message ${String(index)}`): string {
  return JSON.stringify({
    type: "message", timestamp: `2026-09-05T14:00:${String(index % 60).padStart(2, "0")}.000Z`,
    message: { role: index % 2 === 0 ? "assistant" : "user", content: [{ type: "text", text }] },
  });
}

function committedEntry(index: number, text = `transaction ${String(index)}`): Record<string, unknown> {
  return {
    kind: "entry", seq: index + 1, timestamp: Date.parse(`2026-09-05T14:00:${String(index % 60).padStart(2, "0")}.000Z`),
    id: `entry-${String(index)}`, parentId: index === 0 ? null : `entry-${String(index - 1)}`, type: "message",
    message: { role: index % 2 === 0 ? "assistant" : "user", content: [{ type: "text", text }] },
  };
}

function transaction(...entries: Record<string, unknown>[]): string {
  return JSON.stringify(entries);
}

async function sessionHome(lines: string[], second = false): Promise<{ home: string; session: string; other?: string }> {
  const home = await mkdtemp(join(tmpdir(), "bot-session-page-"));
  roots.push(home);
  const session = join(home, "runs", RUN, "stages/01-work/1/session.jsonl");
  const other = join(home, "runs", RUN, "stages/02-other/1/session.jsonl");
  await mkdir(join(session, ".."), { recursive: true });
  if (second) await mkdir(join(other, ".."), { recursive: true });
  await writeFile(session, lines.length === 0 ? "" : `${lines.join("\n")}\n`);
  if (second) await writeFile(other, `${entry(99, "other")}\n`);
  await writeFile(join(home, "runs", RUN, "record.jsonl"), currentRecord([
    { record: 1, event: "run_start", run: RUN, assembly: "paging", flow: "main", ts: "2026-09-05T14:00:00.000Z" },
    { event: "stage_start", stage: "01-work", retry: 1, session: "stages/01-work/1/session.jsonl", ts: "2026-09-05T14:00:01.000Z" },
    ...(second ? [{ event: "stage_start", stage: "02-other", retry: 1, session: "stages/02-other/1/session.jsonl", ts: "2026-09-05T14:00:02.000Z" }] : []),
  ]));
  return { home, session, ...(second ? { other } : {}) };
}

function cursor(stderr: string): string {
  const found = /--after (?<cursor>\S+)/u.exec(stderr)?.groups?.["cursor"];
  if (found === undefined) throw new Error(`No cursor in: ${stderr}`);
  return found.replace(/\.$/u, "");
}

function changedCursor(value: string, offset: number): string {
  const decoded = Buffer.from(value, "base64url").toString().split("\0");
  decoded[7] = String(offset);
  return Buffer.from(decoded.join("\0")).toString("base64url");
}

function changedOrdinal(value: string, ordinal: number): string {
  const decoded = Buffer.from(value, "base64url").toString().split("\0");
  decoded[8] = String(ordinal);
  return Buffer.from(decoded.join("\0")).toString("base64url");
}

function versionOneCursor(value: string): string {
  const decoded = Buffer.from(value, "base64url").toString().split("\0");
  decoded[0] = "1";
  decoded.splice(8, 1);
  return Buffer.from(decoded.join("\0")).toString("base64url");
}

function identifiers(output: string, pattern: RegExp): string[] {
  return [...output.matchAll(pattern)].map((matched) => matched[0]);
}

test("message-count pages resume inside one format-4 transaction without loss", async () => {
  const held = await sessionHome([transaction(committedEntry(0), committedEntry(1), committedEntry(2))]);
  const first = await invokeCli(["run", "session", RUN, "01-work", "--limit", "1"], { home: held.home });
  const firstCursor = cursor(first.err);
  expect(Buffer.from(firstCursor, "base64url").toString().split("\0")).toMatchObject({ 0: "2", 8: "1" });

  const second = await invokeCli(["run", "session", RUN, "01-work", "--limit", "1", "--after", firstCursor], { home: held.home });
  const third = await invokeCli(["run", "session", RUN, "01-work", "--limit", "2", "--after", cursor(second.err)], { home: held.home });
  const pages = [first, second, third].map((page) => identifiers(page.out, /transaction \d+/gu));
  expect(pages).toEqual([["transaction 0"], ["transaction 1"], ["transaction 2"]]);
  expect(pages.flat()).toEqual(["transaction 0", "transaction 1", "transaction 2"]);
  expect(third.err).toMatch(/reached the end/iu);
});

test("rendered-byte pages resume inside one format-4 transaction without loss", async () => {
  const held = await sessionHome([
    entry(0, `before ${"a".repeat(600_000)}`),
    transaction(committedEntry(1, `middle ${"b".repeat(300_000)}`), committedEntry(2, `after ${"c".repeat(300_000)}`)),
  ]);
  const first = await invokeCli(["run", "session", RUN, "01-work", "--limit", "3"], { home: held.home });
  const second = await invokeCli(["run", "session", RUN, "01-work", "--limit", "3", "--after", cursor(first.err)], { home: held.home });
  const pages = [first, second].map((page) => identifiers(page.out, /before|middle|after/gu));
  expect(pages).toEqual([["before", "middle"], ["after"]]);
  expect(pages.flat()).toEqual(["before", "middle", "after"]);
  expect(second.err).toMatch(/reached the end/iu);
});

test("version-1 cursors resume at ordinal zero and invalid version-2 ordinals are refused", async () => {
  const held = await sessionHome([entry(0), transaction(committedEntry(1), committedEntry(2))]);
  const first = await invokeCli(["run", "session", RUN, "01-work", "--limit", "1"], { home: held.home });
  const legacy = versionOneCursor(cursor(first.err));
  const continued = await invokeCli(["run", "session", RUN, "01-work", "--limit", "2", "--after", legacy], { home: held.home });
  expect(continued.out).toContain("transaction 1");
  expect(continued.out).toContain("transaction 2");
  expect(continued.err).toMatch(/reached the end/iu);

  const inside = await invokeCli(["run", "session", RUN, "01-work", "--limit", "2"], { home: held.home });
  const invalid = await invokeCli([
    "run", "session", RUN, "01-work", "--after", changedOrdinal(cursor(inside.err), 99),
  ], { home: held.home });
  expect([invalid.code, invalid.out]).toEqual([3, ""]);
  expect(invalid.err).toMatch(/cursor.*ordinal/iu);
});

test("a session beyond both old bounds is retrieved once across stable pages", async () => {
  const lines = Array.from({ length: 10_001 }, (_, index) => entry(index, `${String(index)} ${"x".repeat(100)}`));
  const held = await sessionHome(lines);
  let after: string | undefined;
  const shown: string[] = [];
  do {
    const read = await invokeCli(["run", "session", RUN, "01-work", "--limit", "500", ...(after === undefined ? [] : ["--after", after])], { home: held.home });
    expect(read.code).toBe(0);
    shown.push(...read.out.trimEnd().split("\n").filter(Boolean));
    after = read.err.includes("more messages remain") || read.err.includes("more session data remains") ? cursor(read.err) : undefined;
    if (after === undefined) expect(read.err).toMatch(/reached the end/iu);
  } while (after !== undefined);
  expect(shown).toHaveLength(lines.length);
  expect(shown[0]).toContain("0 ");
  expect(shown.at(-1)).toContain("10000 ");
});

test("paging skips malformed and non-message entries and keeps multibyte text at a chunk boundary", async () => {
  const prefix = entry(0, "x".repeat(65_400));
  const held = await sessionHome([prefix, "not: [valid", JSON.stringify({ type: "metadata" }), entry(1, "snowman ☃"), entry(2)]);
  const first = await invokeCli(["run", "session", RUN, "01-work", "--limit", "2"], { home: held.home });
  expect(first.code).toBe(0);
  expect(first.out).toContain("snowman ☃");
  expect(first.out).not.toContain("message 2");
  expect(first.err).toMatch(/more messages remain/iu);
  const second = await invokeCli(["run", "session", RUN, "01-work", "--limit", "2", "--after", cursor(first.err)], { home: held.home });
  expect(second.out).toContain("message 2");
  expect(second.err).toMatch(/reached the end/iu);
});

test("the default page contains 100 messages and one extra message proves incompleteness", async () => {
  const held = await sessionHome(Array.from({ length: 101 }, (_, index) => entry(index)));
  const read = await invokeCli(["run", "session", RUN, "01-work"], { home: held.home });
  expect(read.code).toBe(0);
  expect(read.out.trimEnd().split("\n")).toHaveLength(100);
  expect(read.out).not.toContain("message 100");
  expect(read.err).toMatch(/Showing 100 messages; more messages remain/iu);
  expect(Buffer.from(cursor(read.err), "base64url").toString()).not.toContain("stages/01-work/1/session.jsonl");
});

test("an existing empty session succeeds and says the page reached its end", async () => {
  const held = await sessionHome([]);
  const read = await invokeCli(["run", "session", RUN, "01-work"], { home: held.home });
  expect([read.code, read.out]).toEqual([0, ""]);
  expect(read.err).toMatch(/0 messages.*reached the end/iu);
});

test("a cursor cannot cross a selection or survive a changed snapshot", async () => {
  const held = await sessionHome([entry(0), entry(1)], true);
  const first = await invokeCli(["run", "session", RUN, "01-work", "--limit", "1"], { home: held.home });
  const after = cursor(first.err);
  const crossed = await invokeCli(["run", "session", RUN, "02-other", "--after", after], { home: held.home });
  expect([crossed.code, crossed.out]).toEqual([3, ""]);
  expect(crossed.err).toMatch(/cursor.*selection/iu);
  await writeFile(held.session, `${entry(0)}\n${entry(1)}\n${entry(2)}\n`);
  const stale = await invokeCli(["run", "session", RUN, "01-work", "--after", after], { home: held.home });
  expect([stale.code, stale.out]).toEqual([3, ""]);
  expect(stale.err).toMatch(/cursor.*snapshot/iu);
});

test("mid-line and out-of-range cursor offsets are refused", async () => {
  const held = await sessionHome([entry(0), entry(1)]);
  const first = await invokeCli(["run", "session", RUN, "01-work", "--limit", "1"], { home: held.home });
  const after = cursor(first.err);
  for (const offset of [1, 1_000_000]) {
    const read = await invokeCli(["run", "session", RUN, "01-work", "--after", changedCursor(after, offset)], { home: held.home });
    expect([read.code, read.out]).toEqual([3, ""]);
    expect(read.err).toMatch(/cursor.*position/iu);
  }
});

test("session paging validates limits and does not combine with raw bytes", async () => {
  const held = await sessionHome([entry(0)]);
  for (const argv of [
    ["run", "session", RUN, "01-work", "--limit", "0"],
    ["run", "session", RUN, "01-work", "--limit", "501"],
    ["run", "session", RUN, "01-work", "--after"],
    ["run", "session", RUN, "01-work", "--raw", "--limit", "1"],
    ["run", "session", RUN, "01-work", "--raw", "--after", "anything"],
  ]) {
    const read = await invokeCli(argv, { home: held.home });
    expect([read.code, read.out]).toEqual([2, ""]);
  }
  const raw = await invokeCli(["run", "session", RUN, "01-work", "--raw"], { home: held.home });
  expect(raw.out).toBe(`${entry(0)}\n`);
  const invalidCursor = await invokeCli(["run", "session", RUN, "01-work", "--after", "anything"], { home: held.home });
  expect([invalidCursor.code, invalidCursor.out]).toEqual([2, ""]);
  expect(invalidCursor.err).toMatch(/valid bounded cursor/iu);

  const help = await invokeCli(["run", "session", "--help"], { home: held.home });
  expect(help.out).toContain("--limit N");
  expect(help.out).toContain("--after CURSOR");
});

test("a looped stage still lists repeats before any transcript page", async () => {
  const held = await sessionHome([]);
  await writeFile(join(held.home, "runs", RUN, "record.jsonl"), currentRecord([
    { record: 1, event: "run_start", run: RUN, assembly: "paging", flow: "main", ts: "2026-09-05T14:00:00.000Z" },
    ...successfulStageEvents({ stage: "01-work", repeat: 1, retry: 1 }, "2026-09-05T14:00:01"),
    ...successfulStageEvents({ stage: "01-work", repeat: 2, retry: 1 }, "2026-09-05T14:00:02"),
  ]));
  const read = await invokeCli(["run", "session", RUN, "01-work"], { home: held.home });
  expect(read.code).toBe(0);
  expect(read.out).toContain("01-work  repeat 1  stages/01-work/1/session.jsonl");
  expect(read.out).toContain("01-work  repeat 2  stages/01-work/2/session.jsonl");
  expect(read.err).toBe("");
});

test("a cursor for a loop repeat requires and remains bound to that repeat", async () => {
  const held = await sessionHome([]);
  const repeatTwo = join(held.home, "runs", RUN, "stages/01-work/2/session.jsonl");
  await mkdir(join(repeatTwo, ".."), { recursive: true });
  await writeFile(held.session, `${entry(0)}\n${entry(1)}\n`);
  await writeFile(repeatTwo, `${entry(2)}\n${entry(3)}\n`);
  await writeFile(join(held.home, "runs", RUN, "record.jsonl"), currentRecord([
    { record: 1, event: "run_start", run: RUN, assembly: "paging", flow: "main", ts: "2026-09-05T14:00:00.000Z" },
    ...successfulStageEvents({ stage: "01-work", repeat: 1, retry: 1 }, "2026-09-05T14:00:01"),
    ...successfulStageEvents({ stage: "01-work", repeat: 2, retry: 1 }, "2026-09-05T14:00:02"),
  ]));
  const first = await invokeCli(["run", "session", RUN, "01-work", "--repeat", "1", "--limit", "1"], { home: held.home });
  const after = cursor(first.err);
  const unspecified = await invokeCli(["run", "session", RUN, "01-work", "--after", after], { home: held.home });
  expect([unspecified.code, unspecified.out]).toEqual([3, ""]);
  expect(unspecified.err).toMatch(/Give --repeat/iu);
  const crossed = await invokeCli(["run", "session", RUN, "01-work", "--repeat", "2", "--after", after], { home: held.home });
  expect([crossed.code, crossed.out]).toEqual([3, ""]);
  expect(crossed.err).toMatch(/different selection/iu);
  const continued = await invokeCli(["run", "session", RUN, "01-work", "--repeat", "1", "--after", after], { home: held.home });
  expect(continued.out).toContain("message 1");
  expect(continued.err).toMatch(/reached the end/iu);
});

test("rendered output stays within one MiB and an individually oversized message is refused", async () => {
  const paged = await sessionHome([entry(0, "a".repeat(600_000)), entry(1, "b".repeat(600_000))]);
  const first = await invokeCli(["run", "session", RUN, "01-work", "--limit", "2"], { home: paged.home });
  expect(Buffer.byteLength(first.out)).toBeLessThanOrEqual(1024 * 1024);
  expect(first.out).toContain("a".repeat(1_000));
  expect(first.out).not.toContain("b".repeat(1_000));
  expect(first.err).toMatch(/more messages remain/iu);
  const second = await invokeCli(["run", "session", RUN, "01-work", "--limit", "2", "--after", cursor(first.err)], { home: paged.home });
  expect(second.out).toContain("b".repeat(1_000));
  expect(second.err).toMatch(/reached the end/iu);

  const oversized = await sessionHome([entry(0, "z".repeat(8 * 1024 * 1024))]);
  let parsed = 0;
  const held = await visitHeldSessionLines(
    join(oversized.home, "runs", RUN), "stages/01-work/1/session.jsonl", 0, undefined,
    () => { parsed += 1; return true; },
  );
  expect(held).toEqual({ kind: "too-large" });
  expect(parsed).toBe(0);
  const refused = await invokeCli(["run", "session", RUN, "01-work"], { home: oversized.home });
  expect([refused.code, refused.out]).toEqual([5, ""]);
  expect(refused.err).toMatch(/session.*too large/iu);
});

test("log lines retain sixteen MiB logical lines and do not count one terminal carriage return", async () => {
  const home = await mkdtemp(join(tmpdir(), "bot-session-line-bound-"));
  roots.push(home);
  const directory = join(home, "run");
  const path = join(directory, "session.jsonl");
  await mkdir(directory, { recursive: true });
  const logical = Buffer.alloc(16 * 1024 * 1024, 0x78);

  await writeFile(path, Buffer.concat([logical, Buffer.from("\r\n")]));
  let visits = 0;
  let read = await visitHeldRunLines(directory, "session.jsonl", (line) => {
    visits += 1;
    expect(Buffer.byteLength(line)).toBe(logical.length);
  });
  expect(read.kind).toBe("held");
  expect(visits).toBe(1);

  await writeFile(path, Buffer.concat([logical, Buffer.from("\r")]));
  visits = 0;
  read = await visitHeldRunLines(directory, "session.jsonl", (line) => {
    visits += 1;
    expect(Buffer.byteLength(line)).toBe(logical.length);
  });
  expect(read.kind).toBe("held");
  expect(visits).toBe(1);

  await writeFile(path, Buffer.concat([logical, Buffer.from("x\r\n")]));
  visits = 0;
  read = await visitHeldRunLines(directory, "session.jsonl", () => { visits += 1; });
  expect(read).toEqual({ kind: "too-large" });
  expect(visits).toBe(0);
});

test("a long run of non-messages stops on the source-work bound with a continuation", async () => {
  const metadata = `${JSON.stringify({ type: "metadata" })}\n`;
  const held = await sessionHome([metadata.repeat(Math.ceil((5 * 1024 * 1024) / Buffer.byteLength(metadata))), entry(1)]);
  const first = await invokeCli(["run", "session", RUN, "01-work"], { home: held.home });
  expect([first.code, first.out]).toEqual([0, ""]);
  expect(first.err).toMatch(/0 messages; more session data remains/iu);
  const second = await invokeCli(["run", "session", RUN, "01-work", "--after", cursor(first.err)], { home: held.home });
  expect(second.out).toContain("message 1");
  expect(second.err).toMatch(/reached the end/iu);
});
