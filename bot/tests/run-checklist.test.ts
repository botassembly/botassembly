import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { invokeCli, invokeCliBytes } from "./invoke.ts";

const RUN = "2026-09-10T15-00-00-a237";
const TS = "2026-09-10T15:00:00.000Z";
const roots: string[] = [];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function start(run = RUN): Record<string, unknown> {
  return { record: 1, event: "run_start", ts: TS, run, assembly: "review", flow: "main" };
}

function opened(stage: string, retry: number, repeat?: number): Record<string, unknown> {
  return { event: "stage_start", ts: TS, stage, retry, ...(repeat === undefined ? {} : { repeat }) };
}

function ended(stage: string, retry: number, repeat?: number): Record<string, unknown> {
  return { event: "stage_end", ts: TS, stage, retry, ...(repeat === undefined ? {} : { repeat }), exit: 1, cause: "refused" };
}

function mark(stage: string, retry: number, item: number, decision: "done" | "skipped", extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { event: "tool_call", ts: TS, stage, retry, tool: "mark", item, decision, ...extra };
}

async function fixture(events: Record<string, unknown>[], run = RUN): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-run-checklist-"));
  roots.push(root);
  const home = join(root, "home"), directory = join(home, "runs", run);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "record.jsonl"), `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  return home;
}

test("run checklist preserves mark order in exact JSON and inert Markdown", async () => {
  const first = mark("01-a|<x>", 1, 2, "done", { evidence: "line\n|<ok>", future: { additive: true } });
  const second = mark("02-b", 3, 7, "skipped", { repeat: 2, evidence: "not present", reason: "does not apply" });
  const home = await fixture([
    start(), opened("01-a|<x>", 1), first, ended("01-a|<x>", 1),
    opened("02-b", 3, 2), second, ended("02-b", 3, 2),
    { event: "run_end", ts: TS, exit: 1, cause: "refused" },
  ]);
  const json = await invokeCli(["run", "checklist", RUN.slice(0, 20), "--json"], { home });
  expect(json.code, json.err).toBe(0);
  expect(json.out.endsWith("\n")).toBe(true);
  expect(JSON.parse(json.out)).toEqual({ schemaVersion: 1, kind: "bot.run.checklist", data: { run: RUN, marks: [
    { stage: "01-a|<x>", repeat: null, retry: 1, item: 2, decision: "done", evidence: "line\n|<ok>", reason: null },
    { stage: "02-b", repeat: 2, retry: 3, item: 7, decision: "skipped", evidence: "not present", reason: "does not apply" },
  ] } });
  const human = await invokeCli(["run", "checklist", RUN], { home });
  expect(human.code, human.err).toBe(0);
  expect(human.out.split("\n").slice(0, 2)).toEqual([
    "| Stage | Repeat | Retry | Item | Decision | Evidence | Reason |",
    "| --- | ---: | ---: | ---: | --- | --- | --- |",
  ]);
  expect(human.out).toContain("01-a\\|&lt;x&gt;");
  expect(human.out).toContain("line\\\\x0a\\|&lt;ok&gt;");
  expect(human.out.indexOf("line\\\\x0a")).toBeLessThan(human.out.indexOf("not present"));
});

test("historical evidence and optional text become null while present empty text fails", async () => {
  const home = await fixture([start(), opened("01-a", 1), mark("01-a", 1, 1, "done"), ended("01-a", 1),
    { event: "run_end", ts: TS, exit: 1, cause: "refused" }]);
  const held = await invokeCli(["run", "checklist", RUN, "-j"], { home });
  expect(held.code, held.err).toBe(0);
  expect(JSON.parse(held.out)).toMatchObject({ data: { marks: [{ repeat: null, evidence: null, reason: null }] } });

  for (const changed of [{ evidence: "" }, { reason: "" }, { evidence: null }, { reason: null }]) {
    const bad = await fixture([start(), opened("01-a", 1), mark("01-a", 1, 1, "done", changed)]);
    const result = await invokeCliBytes(["run", "checklist", RUN, "--json"], { home: bad });
    expect(result.code, JSON.stringify(changed)).toBe(5);
    expect(result.out).toEqual(Buffer.alloc(0));
    expect(JSON.parse(result.err.toString())).toMatchObject({ error: { operation: "run.checklist", code: "integrity-failed" } });
  }
});

test("Markdown clips a retained cell at 480 escaped bytes while JSON keeps the complete text", async () => {
  const evidence = `<${"x".repeat(600)}|`;
  const home = await fixture([start(), opened("01-a", 1), mark("01-a", 1, 1, "done", { evidence })]);
  const human = await invokeCli(["run", "checklist", RUN], { home });
  const row = human.out.split("\n")[2] ?? "";
  const cell = row.split(" | ")[5] ?? "";
  expect(Buffer.byteLength(cell)).toBeLessThanOrEqual(480);
  expect(cell).toContain("bytes omitted]");
  const json = await invokeCli(["run", "checklist", RUN, "-j"], { home });
  expect(JSON.parse(json.out)).toMatchObject({ data: { marks: [{ evidence }] } });
});

test("stage, retry, and repeat selectors work alone and together with exact equality", async () => {
  const home = await fixture([
    start(),
    opened("01-a", 1), mark("01-a", 1, 1, "done", { evidence: "ordinary" }), ended("01-a", 1),
    opened("01-a", 2, 1), mark("01-a", 2, 2, "done", { repeat: 1, evidence: "explicit one" }), ended("01-a", 2, 1),
    opened("02-b", 2, 2), mark("02-b", 2, 3, "done", { repeat: 2, evidence: "two" }), ended("02-b", 2, 2),
    { event: "run_end", ts: TS, exit: 1, cause: "refused" },
  ]);
  const items = async (args: string[]): Promise<number[]> => {
    const held = await invokeCli(["run", "checklist", RUN, ...args, "-j"], { home });
    expect(held.code, held.err).toBe(0);
    return (JSON.parse(held.out) as { data: { marks: Array<{ item: number }> } }).data.marks.map(({ item }) => item);
  };
  expect(await items(["--stage", "01-a"])).toEqual([1, 2]);
  expect(await items(["--retry", "2"])).toEqual([2, 3]);
  expect(await items(["--repeat", "1"])).toEqual([2]);
  expect(await items(["--stage", "02-b", "--retry", "2", "--repeat", "2"])).toEqual([3]);
});

test("empty selections and missing or ambiguous runs use exit 1 without stdout", async () => {
  const home = await fixture([start(), opened("01-a", 1), mark("01-a", 1, 1, "done", { evidence: "yes" })]);
  const empty = await invokeCliBytes(["run", "checklist", RUN, "--stage", "missing", "--json"], { home });
  expect(empty).toMatchObject({ code: 1, out: Buffer.alloc(0) });
  expect(JSON.parse(empty.err.toString())).toMatchObject({ error: { operation: "run.checklist", cause: "selection-empty" } });
  expect(await invokeCliBytes(["run", "checklist", "absent"], { home })).toMatchObject({ code: 1, out: Buffer.alloc(0) });
  await mkdir(join(home, "runs", `${RUN}-other`));
  expect(await invokeCliBytes(["run", "checklist", RUN], { home })).toMatchObject({ code: 1, out: Buffer.alloc(0) });
});

test("every matching mark is validated while malformed non-mark calls are ignored", async () => {
  const malformed = [
    { stage: "", retry: 1, item: 1, decision: "done", evidence: "x" },
    { stage: 7, retry: 1, item: 1, decision: "done", evidence: "x" },
    { stage: "01-a", retry: 0, item: 1, decision: "done", evidence: "x" },
    { stage: "01-a", retry: Number.MAX_SAFE_INTEGER + 1, item: 1, decision: "done", evidence: "x" },
    { stage: "01-a", retry: 1, item: 0, decision: "done", evidence: "x" },
    { stage: "01-a", retry: 1, item: "1", decision: "done", evidence: "x" },
    { stage: "01-a", retry: 1, item: 1, repeat: 0, decision: "done", evidence: "x" },
    { stage: "01-a", retry: 1, item: 1, repeat: Number.MAX_SAFE_INTEGER + 1, decision: "done", evidence: "x" },
    { stage: "01-a", retry: 1, item: 1, decision: "maybe", evidence: "x" },
    { stage: "01-a", retry: 1, item: 1, decision: "skipped", evidence: "x" },
  ];
  for (const fields of malformed) {
    const home = await fixture([start(), opened("01-a", 1), { event: "tool_call", ts: TS, tool: "mark", ...fields }]);
    expect(await invokeCliBytes(["run", "checklist", RUN, "--stage", "elsewhere"], { home }))
      .toMatchObject({ code: 5, out: Buffer.alloc(0) });
  }
  const home = await fixture([start(), opened("01-a", 1),
    { event: "tool_call", ts: TS, stage: "01-a", retry: 1, tool: "refuse", decision: 7, item: "bad" },
    mark("01-a", 1, 1, "done", { evidence: "kept" })]);
  const held = await invokeCli(["run", "checklist", RUN, "-j"], { home });
  expect(held.code, held.err).toBe(0);
  expect(JSON.parse(held.out)).toMatchObject({ data: { marks: [{ item: 1 }] } });
});

test("a valid incomplete record exposes its recorded mark prefix", async () => {
  const home = await fixture([start(), opened("01-a", 1), mark("01-a", 1, 4, "done", { evidence: "observed" })]);
  const held = await invokeCli(["run", "checklist", RUN, "-j"], { home });
  expect(held.code, held.err).toBe(0);
  expect(JSON.parse(held.out)).toMatchObject({ data: { marks: [{ stage: "01-a", item: 4 }] } });
});

test("a later legal no-output ending does not suppress an earlier mark", async () => {
  const home = await fixture([start(), opened("01-a", 1), mark("01-a", 1, 4, "done", { evidence: "observed" }), ended("01-a", 1),
    opened("02-b", 1), ended("02-b", 1), { event: "run_end", ts: TS, exit: 1, cause: "refused" }]);
  const held = await invokeCli(["run", "checklist", RUN, "-j"], { home });
  expect(held.code, held.err).toBe(0);
  expect(JSON.parse(held.out)).toMatchObject({ data: { marks: [{ stage: "01-a", item: 4 }] } });
});

test.each([
  [[]], [[RUN, "extra"]], [[RUN, "--json", "-j"]], [[RUN, "--home"]], [[RUN, "--home", "/a", "--home", "/b"]],
  [[RUN, "--stage"]], [[RUN, "--stage", ""]], [[RUN, "--retry", "0"]], [[RUN, "--retry", "1.5"]], [[RUN, "--retry", "9007199254740992"]], [[RUN, "--repeat", "1e0"]],
  [[RUN, "--stage", "a", "--stage", "b"]], [[RUN, "--retry", "1", "--retry", "2"]], [[RUN, "--repeat", "1", "--repeat", "2"]],
  [[RUN, "--raw"]],
])("invalid request %j exits 2 before home access", async (args: string[]) => {
  expect((await invokeCliBytes(["run", "checklist", ...args], { home: "/definitely/absent" })).code).toBe(2);
});

test("record faults fail integrity and never emit partial output", async () => {
  const home = await fixture([start(), opened("01-a", 1), mark("01-a", 1, 1, "done", { evidence: "yes" })]);
  const path = join(home, "runs", RUN, "record.jsonl");
  for (const bytes of [Buffer.from("not-json\n"), Buffer.from([0xff, 0x0a]), Buffer.from('{"record":99,"event":"run_start","ts":"2026-09-10T15:00:00.000Z"}\n'), Buffer.from(`${"x".repeat(1_048_577)}\n`)]) {
    await writeFile(path, bytes);
    expect(await invokeCliBytes(["run", "checklist", RUN], { home })).toMatchObject({ code: 5, out: Buffer.alloc(0) });
  }
  await rm(path);
  expect(await invokeCliBytes(["run", "checklist", RUN], { home })).toMatchObject({ code: 1, out: Buffer.alloc(0) });
  await mkdir(path);
  expect(await invokeCliBytes(["run", "checklist", RUN], { home })).toMatchObject({ code: 5, out: Buffer.alloc(0) });
  await rm(path, { recursive: true });
  await writeFile(path, `${JSON.stringify(start())}\n`);
  await chmod(path, 0o000);
  expect(await invokeCliBytes(["run", "checklist", RUN], { home })).toMatchObject({ code: 5, out: Buffer.alloc(0) });
  await chmod(path, 0o600);
});

test("capabilities and help publish the network-free bounded checklist reader", async () => {
  const home = await fixture([start(), opened("01-a", 1), mark("01-a", 1, 1, "done", { evidence: "yes" })]);
  const capabilities = JSON.parse((await invokeCli(["capabilities", "-j"], { home })).out) as { data: { commands: Array<Record<string, unknown>> } };
  expect(capabilities.data.commands.find((row) => row["operation"] === "run.checklist")).toMatchObject({
    command: ["run", "checklist"], output: { kind: "bot.run.checklist", schemaVersion: 1 }, modes: ["markdown", "json"],
    home: "reads", mutates: false, network: "never", limits: { recordBytes: 1_048_576, markdownCellBytes: 480 },
  });
  const help = await invokeCli(["run", "checklist", "--help"], { home });
  expect(help.code).toBe(0);
  expect(help.out).toContain("usage: bot run checklist <run>");
  expect(help.out).toContain("1,048,576");
  expect(help.out).toContain("480");
  expect((await invokeCli(["--help"], { home })).out).toContain("  run checklist ");
});

test("the specification, conformance, changelog, and documentation publish the checklist contract", async () => {
  const publications = new Map([
    ["../../specification/elements/inspection.md", ["`bot run checklist RUN", "`bot.run.checklist`", "480-byte limit", "1 MiB limit"]],
    ["../../specification/conformance.md", ["`run checklist` tests", "absent repeat versus explicit repeat one"]],
    ["../../specification/CHANGELOG.md", ["Ticket 0237", "`bot run checklist RUN`"]],
    ["../../docs/src/content/docs/reference/inspection.md", ["`bot run checklist RUN", "480 bytes", "1 MiB reader limit"]],
  ]);
  for (const [file, phrases] of publications) {
    const text = await readFile(new URL(file, import.meta.url), "utf8");
    for (const phrase of phrases) expect(text, `${file}: ${phrase}`).toContain(phrase);
  }
});
