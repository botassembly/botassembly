import { chmod, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { boundedHeldRunFile } from "../src/run-files.ts";
import { currentRecord } from "./current-record.ts";
import { invokeCli, invokeCliBytes } from "./invoke.ts";

const RUN = "2026-09-08T14-00-00-a059";
const roots: string[] = [];
const digest = "a".repeat(64);

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function check(stage: string, retry: number, name: string, capture: string, exit: number | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { event: "check", ts: "2026-09-08T14:00:01.000Z", stage, retry, check: name, exit, capture, ...extra };
}

function identityKey(event: Record<string, unknown>): string {
  const stage = typeof event["stage"] === "string" ? event["stage"] : "invalid";
  const retry = typeof event["retry"] === "number" ? event["retry"] : 0;
  const repeat = typeof event["repeat"] === "number" ? event["repeat"] : undefined;
  return `${stage}:${String(repeat ?? "")}:${String(retry)}`;
}

async function writeCapture(directory: string, event: Record<string, unknown>): Promise<void> {
  const capture = event["capture"];
  if (typeof capture !== "string" || capture.includes("..")) return;
  const target = join(directory, ...capture.split("/"));
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, Buffer.from(`bytes:${capture}`));
}

async function fixture(checks: Record<string, unknown>[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-run-check-"));
  roots.push(root);
  const home = join(root, "home"), directory = join(home, "runs", RUN);
  await mkdir(directory, { recursive: true });
  const identities = new Map<string, Record<string, unknown>[]>();
  for (const event of checks) {
    const key = identityKey(event);
    identities.set(key, [...(identities.get(key) ?? []), event]);
    await writeCapture(directory, event);
  }
  const events: Record<string, unknown>[] = [{ record: 1, event: "run_start", ts: "2026-09-08T14:00:00.000Z", run: RUN, assembly: "review", flow: "main" }];
  let second = 1;
  for (const rows of identities.values()) {
    const first = rows[0] ?? {};
    const identity = { stage: first["stage"], retry: first["retry"], ...(first["repeat"] === undefined ? {} : { repeat: first["repeat"] }) };
    events.push({ event: "stage_start", ts: `2026-09-08T14:00:0${String(second)}.000Z`, ...identity }, ...rows,
      { event: "stage_end", ts: `2026-09-08T14:00:0${String(second)}.900Z`, ...identity, exit: 0, cause: "success" });
    second += 1;
  }
  events.push({ event: "run_end", ts: "2026-09-08T14:00:09.000Z", exit: 0, cause: "success" });
  await writeFile(join(directory, "record.jsonl"), currentRecord(events));
  return home;
}

test("run check lists every named recording in record order as Markdown and exact JSON", async () => {
  const first = "stages/01-a/1/1/checks/checklist.txt", second = "stages/02-b/2/3/checks/gate.txt";
  const home = await fixture([
    check("01-a|<x>", 1, "checklist", first, 7),
    check("02-b", 3, "checklist", second, null, { repeat: 2, file: "flows/main/gate/check", sha256: digest }),
  ]);
  const human = await invokeCli(["run", "check", RUN, "checklist"], { home });
  expect(human.code, human.err).toBe(0);
  expect(human.out.split("\n").slice(0, 2)).toEqual([
    "| Stage | Repeat | Retry | Exit | Capture | Executable file | Executable SHA-256 |",
    "| --- | ---: | ---: | ---: | --- | --- | --- |",
  ]);
  expect(human.out).toContain("01-a\\|&lt;x&gt;");
  expect(human.out.indexOf(first)).toBeLessThan(human.out.indexOf(second));
  const json = await invokeCli(["run", "check", RUN, "checklist", "--json"], { home });
  expect(JSON.parse(json.out)).toEqual({ schemaVersion: 1, kind: "bot.run.check", data: { run: RUN, check: "checklist", recordings: [
    { stage: "01-a|<x>", repeat: null, retry: 1, exit: 7, capture: first, executableFile: null, executableSha256: null },
    { stage: "02-b", repeat: 2, retry: 3, exit: null, capture: second, executableFile: "flows/main/gate/check", executableSha256: digest },
  ] } });
});

test("selectors narrow listings and raw reads any exact attempt", async () => {
  const ordinary = "stages/01-a/1/1/checks/gate.txt", loop = "stages/01-a/2/1/checks/gate.txt";
  const home = await fixture([
    check("01-a", 1, "gate", ordinary, 9, { file: "gates/first" }),
    check("01-a", 1, "gate", loop, 0, { repeat: 2, file: "gates/second" }),
  ]);
  const exact = await invokeCliBytes(["run", "check", RUN, "gate", "--stage", "01-a", "--retry", "1", "--file", "gates/first", "--raw"], { home });
  expect(exact).toEqual({ code: 0, out: Buffer.from(`bytes:${ordinary}`), err: Buffer.alloc(0) });
  type CheckDocument = { data: { recordings: Array<{ capture: string }> } };
  const repeatOne = await invokeCli(["run", "check", RUN, "gate", "--stage", "01-a", "--retry", "1", "--repeat", "1", "--json"], { home });
  expect((JSON.parse(repeatOne.out) as CheckDocument).data.recordings).toHaveLength(1);
  const repeatTwo = await invokeCli(["run", "check", RUN, "gate", "--stage", "01-a", "--retry", "1", "--repeat", "2", "--json"], { home });
  expect((JSON.parse(repeatTwo.out) as CheckDocument).data.recordings[0]?.capture).toBe(loop);
});

test("raw without an attempt requires agreeing successful recordings", async () => {
  const capture = "stages/01-a/1/1/checks/gate.txt";
  const home = await fixture([check("01-a", 1, "gate", capture, 3), check("01-a", 1, "gate", capture, 0)]);
  expect(await invokeCliBytes(["run", "check", RUN, "gate", "--raw"], { home }))
    .toEqual({ code: 0, out: Buffer.from(`bytes:${capture}`), err: Buffer.alloc(0) });
  const disagreement = await fixture([check("01-a", 1, "gate", capture, 0), check("01-a", 1, "gate", "stages/01-a/1/1/checks/other.txt", 0)]);
  expect(await invokeCliBytes(["run", "check", RUN, "gate", "--raw"], { home: disagreement })).toMatchObject({ code: 1, out: Buffer.alloc(0) });
});

test("malformed matching recordings fail integrity and malformed requests fail usage", async () => {
  const home = await fixture([check("01-a", 1, "gate", "../escape", 0)]);
  for (const mode of [[], ["--json"], ["--raw"]]) {
    const held = await invokeCliBytes(["run", "check", RUN, "gate", ...mode], { home });
    expect(held.code).toBe(5);
    expect(held.out).toEqual(Buffer.alloc(0));
  }
  for (const args of [
    [], [RUN], [RUN, "gate", "--json", "--raw"], [RUN, "gate", "--json", "--json"],
    [RUN, "gate", "--stage", "01-a"], [RUN, "gate", "--retry", "1"], [RUN, "gate", "--stage", "01-a", "--retry", "0"],
    [RUN, "gate", "--raw", "--raw"], [RUN, "gate", "--file", "a", "--file", "b"],
    [RUN, "gate", "--home", home, "--home", home], [RUN, "gate", "--stage", "01-a", "--stage", "01-b", "--retry", "1"],
    [RUN, "gate", "--stage", "01-a", "--retry", "1", "--retry", "2"],
    [RUN, "gate", "--stage", "01-a", "--retry", "1", "--repeat", "1", "--repeat", "2"],
    [RUN, "gate", "--unknown"], [RUN, "gate", "extra"],
  ]) expect((await invokeCliBytes(["run", "check", ...args], { home })).code, args.join(" ")).toBe(2);
});

test("a regular-file runs entry returns the shared exit-1 error without stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-run-check-invalid-home-"));
  roots.push(root);
  const home = join(root, "home");
  await mkdir(home);
  await writeFile(join(home, "runs"), "not a directory");
  const held = await invokeCliBytes(["run", "check", RUN, "gate", "--json"], { home });
  expect(held.code).toBe(1);
  expect(held.out).toEqual(Buffer.alloc(0));
  expect(JSON.parse(held.err.toString())).toMatchObject({ error: { operation: "run.check" } });
});

test("raw delivery failure returns exit 1 and preserves only the accepted prefix", async () => {
  const capture = "stages/01-a/1/1/checks/gate.txt", home = await fixture([check("01-a", 1, "gate", capture, 0)]);
  const accepted: Buffer[] = [], fault = Object.assign(new Error("injected delivery failure"), { code: "ENOSPC" });
  const held = await invokeCliBytes(["run", "check", RUN, "gate", "--raw"], { home, rawStdout: (bytes) => {
    accepted.push(Buffer.from(bytes).subarray(0, 3));
    return Promise.reject(fault);
  } });
  expect(held.code).toBe(1);
  expect(Buffer.concat(accepted)).toEqual(Buffer.from("byt"));
  expect(held.err.toString()).toMatch(/stdout delivery.*ENOSPC/iu);
});

test("capabilities and help publish run check and both byte limits", async () => {
  const home = await fixture([check("01-a", 1, "gate", "stages/01-a/1/1/checks/gate.txt", 0)]);
  const capabilities = JSON.parse((await invokeCli(["capabilities", "--json"], { home })).out) as { data: { commands: Array<{ operation: string }> } };
  expect(capabilities.data.commands.find((row: { operation: string }) => row.operation === "run.check")).toMatchObject({
    command: ["run", "check"], output: { kind: "bot.run.check", schemaVersion: 1 }, modes: ["markdown", "json", "raw"],
    limits: { captureBytes: 16_777_216, recordBytes: 1_048_576 },
  });
  const help = await invokeCli(["run", "check", "--help"], { home });
  expect(help.out).toContain("usage: bot run check <run> <name>");
  expect(help.out).toContain("16,777,216");
});

test("raw buffers the exact allowed capture and rejects a larger one without output", async () => {
  const capture = "stages/01-a/1/1/checks/gate.txt", home = await fixture([check("01-a", 1, "gate", capture, 0)]);
  const target = join(home, "runs", RUN, ...capture.split("/"));
  const boundary = Buffer.alloc(16_777_216, 0x5a);
  await writeFile(target, boundary);
  const accepted = await invokeCliBytes(["run", "check", RUN, "gate", "--raw"], { home });
  expect(accepted.code).toBe(0);
  expect(accepted.err.length).toBe(0);
  expect(accepted.out.equals(boundary)).toBe(true);
  await writeFile(target, Buffer.alloc(16_777_217, 0x5a));
  expect(await invokeCliBytes(["run", "check", RUN, "gate", "--raw"], { home }))
    .toMatchObject({ code: 5, out: Buffer.alloc(0) });
});

test("raw rejects missing, linked, non-file, and unreadable evidence without capture bytes", async () => {
  const capture = "stages/01-a/1/1/checks/gate.txt";
  for (const kind of ["missing", "linked", "non-file", "unreadable"] as const) {
    const home = await fixture([check("01-a", 1, "gate", capture, 0)]), target = join(home, "runs", RUN, ...capture.split("/"));
    await unlink(target);
    if (kind === "linked") {
      const outside = join(home, "outside");
      await writeFile(outside, "outside");
      await symlink(outside, target);
    }
    if (kind === "non-file") await mkdir(target);
    if (kind === "unreadable") { await writeFile(target, "evidence"); await chmod(target, 0o000); }
    const held = await invokeCliBytes(["run", "check", RUN, "gate", "--raw"], { home });
    expect(held.code).toBe(5);
    expect(held.out).toEqual(Buffer.alloc(0));
    if (kind === "unreadable") await chmod(target, 0o600);
  }
});

test("the held capture boundary rejects a path replaced during its read", async () => {
  const capture = "stages/01-a/1/1/checks/gate.txt", home = await fixture([check("01-a", 1, "gate", capture, 0)]);
  const directory = join(home, "runs", RUN), target = join(directory, ...capture.split("/"));
  const held = await boundedHeldRunFile(directory, capture, 16_777_216, async () => {
    await unlink(target);
    await writeFile(target, "replacement");
  });
  expect(held.kind).toBe("unreadable");
});

test("record integrity failures use exit 5 while absent selection uses exit 1", async () => {
  const capture = "stages/01-a/1/1/checks/gate.txt", home = await fixture([check("01-a", 1, "gate", capture, 0)]);
  const record = join(home, "runs", RUN, "record.jsonl"), original = await readFile(record);
  const startLine = (fields: Record<string, unknown>): Buffer =>
    Buffer.from(`${JSON.stringify({ ...fields, event: "run_start" })}\n`);
  for (const bytes of [Buffer.from("not-json\n"), Buffer.from([0xff, 0x0a]), startLine({ record: 999 }),
    startLine({ record: 1, ts: "2026-09-08T14:00:00.000Z", run: "wrong" }), Buffer.alloc(1_048_577, 0x78)]) {
    await writeFile(record, bytes);
    const held = await invokeCliBytes(["run", "check", RUN, "gate", "--json"], { home });
    expect(held.code).toBe(5);
    expect(held.out).toEqual(Buffer.alloc(0));
    expect(JSON.parse(held.err.toString())).toMatchObject({ error: { operation: "run.check", code: "integrity-failed" } });
  }
  await writeFile(record, original);
  expect(await invokeCliBytes(["run", "check", RUN, "absent"], { home })).toMatchObject({ code: 1, out: Buffer.alloc(0) });
  await unlink(record);
  expect(await invokeCliBytes(["run", "check", RUN, "gate"], { home })).toMatchObject({ code: 1, out: Buffer.alloc(0) });
  await mkdir(record);
  expect(await invokeCliBytes(["run", "check", RUN, "gate"], { home })).toMatchObject({ code: 5, out: Buffer.alloc(0) });
  await rm(record, { recursive: true });
  await writeFile(record, original);
  await chmod(record, 0o000);
  expect(await invokeCliBytes(["run", "check", RUN, "gate"], { home })).toMatchObject({ code: 5, out: Buffer.alloc(0) });
  await chmod(record, 0o600);
});

test("a structurally valid incomplete run exposes its recorded check prefix", async () => {
  const capture = "stages/01-a/1/1/checks/gate.txt", home = await fixture([check("01-a", 1, "gate", capture, 4)]);
  const record = join(home, "runs", RUN, "record.jsonl");
  const events = (await readFile(record, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  const checkAt = events.findIndex((event) => event["event"] === "check" && event["check"] === "gate");
  await writeFile(record, `${events.slice(0, checkAt + 1).map((event) => JSON.stringify(event)).join("\n")}\n`);
  const held = await invokeCli(["run", "check", RUN, "gate", "--json"], { home });
  expect(held.code, held.err).toBe(0);
  expect((JSON.parse(held.out) as { data: { recordings: Array<{ exit: number }> } }).data.recordings[0]?.exit).toBe(4);
});
