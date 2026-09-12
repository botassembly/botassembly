import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import { CLI_CONTRACTS } from "../src/cli-contract.ts";
import { hashBytes } from "../src/record.ts";
import { runEventsCommand } from "../src/run-events-command.ts";
import { currentRecord } from "./current-record.ts";
import { invokeCli } from "./invoke.ts";

const roots: string[] = [];
const RUN = "2026-09-11T20-00-00-events";
const stamp = "2026-09-11T20:00:00.000Z";

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(): Promise<{ home: string; run: string }> {
  const home = await mkdtemp(join(tmpdir(), "bot-run-events-"));
  roots.push(home);
  const run = join(home, "runs", RUN);
  await mkdir(run, { recursive: true });
  await writeFile(join(run, "record.jsonl"), currentRecord([
    { record: 1, event: "run_start", run: RUN, assembly: "demo", flow: "main", ts: stamp },
    { event: "stage_start", stage: "01-work", retry: 1, ts: stamp },
    { event: "stage_end", stage: "01-work", retry: 1, exit: 0, cause: "success", sealed: true, judged: true, ts: stamp },
    { event: "run_end", exit: 0, cause: "success", ts: stamp },
  ]));
  return { home, run: RUN };
}

const CHILD = "stages/01-work/1/1/subflows/1";

async function childFixture(): Promise<{ home: string; run: string; directory: string; childDirectory: string }> {
  const held = await fixture();
  const input = { text: "inspect", bytes: 7, sha256: hashBytes("inspect") };
  await writeFile(join(held.home, "runs", held.run, "record.jsonl"), currentRecord([
    { record: 1, event: "run_start", run: held.run, assembly: "demo", flow: "main", ts: stamp },
    { event: "stage_start", stage: "01-work", retry: 1, ts: stamp },
    { event: "subflow_call", stage: "01-work", retry: 1, call: 1, flow: "child", started: true, child: CHILD, input, exit: 0, cause: "success", ts: stamp },
    { event: "stage_end", stage: "01-work", retry: 1, exit: 0, cause: "success", ts: stamp },
    { event: "run_end", exit: 0, cause: "success", ts: stamp },
  ]));
  const directory = join(held.home, "runs", held.run);
  const childDirectory = join(directory, ...CHILD.split("/"));
  await mkdir(childDirectory, { recursive: true });
  await writeFile(join(childDirectory, "request.txt"), "inspect");
  await writeFile(join(childDirectory, "record.jsonl"), currentRecord([
    { record: 1, event: "run_start", run: "1", assembly: "demo", flow: "child", request: { path: "request.txt", bytes: 7, sha256: input.sha256, via: "subflow" }, ts: stamp },
    { event: "stage_start", stage: "01-child", retry: 1, ts: stamp },
    { event: "stage_end", stage: "01-child", retry: 1, exit: 0, cause: "success", ts: stamp },
    { event: "run_end", exit: 0, cause: "success", ts: stamp },
  ]));
  return { ...held, directory, childDirectory };
}

test("run events publishes and dispatches a bounded versioned document", async () => {
  const held = await fixture();
  const descriptor = CLI_CONTRACTS.find((candidate) => candidate.operation === "run.events");
  expect(descriptor).toEqual({
    command: ["run", "events"], output: { kind: "bot.run.events", schemaVersion: 1 },
    modes: ["markdown", "json"], home: "reads", mutates: false, network: "never",
    operation: "run.events",
    options: [
      { name: "--child", aliases: [], type: "path", repeatable: false },
      { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
      { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
    ],
    limits: { humanErrorBytes: 2_048, recordBytes: 1_048_576, recordSegments: 10_000, resultBytesExclusive: 2_097_152 },
  });
  const reading = await invokeCli(["run", "events", held.run, "-j"], { home: held.home });
  expect(reading.code, reading.err).toBe(0);
  expect(reading.err).toBe("");
  expect(reading.out.endsWith("\n")).toBe(true);
  const document = JSON.parse(reading.out) as { data: { events: Array<{ event: string }> } };
  expect(document).toMatchObject({
    schemaVersion: 1, kind: "bot.run.events",
    data: { run: held.run, child: null },
  });
  expect(document.data.events.map((event) => event.event)).toEqual(["run_start", "stage_start", "turn", "check", "stage_end", "run_end"]);
});

test("run events provides the retained human root reading", async () => {
  const held = await fixture();
  const current = await invokeCli(["run", "events", held.run], { home: held.home });
  expect(current.code, current.err).toBe(0);
  expect(current.out).toContain("run_start");
});

test("a successful run events reading never asks for a provider or credentials", async () => {
  const held = await fixture(), stdout: Buffer[] = [], stderr: Buffer[] = [];
  const clock: CliBoundary["clock"] = {
    milliseconds: () => 0, timestamp: () => stamp,
    setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
  };
  const code = await main(["run", "events", held.run, "-j"], {
    cwd: "/", env: { BOT_HOME: held.home }, stdinIsTTY: true, stderrIsTTY: false, clock,
    readStdin: () => Promise.resolve(Buffer.alloc(0)), stdout: (bytes) => { stdout.push(Buffer.from(bytes)); },
    stderr: (bytes) => { stderr.push(Buffer.from(bytes)); },
    modelRuntime: () => { throw new Error("provider access"); },
    beforeCredentialAccess: () => { throw new Error("credential access"); },
  });
  expect(code).toBe(0);
  expect(Buffer.concat(stderr)).toEqual(Buffer.alloc(0));
  expect(JSON.parse(Buffer.concat(stdout).toString())).toMatchObject({ kind: "bot.run.events", data: { run: held.run } });
});

test("run events rejects malformed requests before home access", async () => {
  for (const args of [
    ["run", "events"],
    ["run", "events", RUN, "--json", "-j"],
    ["run", "events", RUN, "--json", "--json"],
    ["run", "events", RUN, "--home", "/a", "--home", "/b"],
    ["run", "events", RUN, "--home"],
    ["run", "events", RUN, "--child"],
    ["run", "events", RUN, "--child", CHILD, "--child", CHILD],
    ["run", "events", RUN, "--child", "../outside"],
    ["run", "events", RUN, "--unknown"],
  ]) {
    const held = await invokeCli(args, { home: "/definitely/absent" });
    expect(held.code, args.join(" ")).toBe(2);
    expect(held.out, args.join(" ")).toBe("");
  }
});

test("run events bounds malformed diagnostics and never asks for a provider", async () => {
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  const clock: CliBoundary["clock"] = {
    milliseconds: () => 0, timestamp: () => stamp,
    setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
  };
  const code = await main(["run", "events", RUN, `--json${"x".repeat(10_000)}`], {
    cwd: "/", env: { BOT_HOME: "/definitely/absent" }, stdinIsTTY: true, stderrIsTTY: false, clock,
    readStdin: () => Promise.resolve(Buffer.alloc(0)), stdout: (bytes) => { stdout.push(Buffer.from(bytes)); },
    stderr: (bytes) => { stderr.push(Buffer.from(bytes)); },
    modelRuntime: () => { throw new Error("provider access"); },
    beforeCredentialAccess: () => { throw new Error("credential access"); },
  });
  expect(code).toBe(2);
  expect(Buffer.concat(stdout)).toEqual(Buffer.alloc(0));
  expect(Buffer.concat(stderr).length).toBeLessThanOrEqual(2_049);
});

test("run events uses typed selection and integrity failures", async () => {
  const held = await fixture();
  const missing = await invokeCli(["run", "events", "missing", "-j"], { home: held.home });
  expect(missing.code).toBe(1);
  expect(JSON.parse(missing.err)).toMatchObject({ error: { operation: "run.events", cause: "run-missing" } });

  await rm(join(held.home, "runs", held.run, "record.jsonl"));
  const noRecord = await invokeCli(["run", "events", held.run, "-j"], { home: held.home });
  expect(noRecord.code).toBe(1);
  expect(JSON.parse(noRecord.err)).toMatchObject({ error: { operation: "run.events", cause: "record-missing" } });

  await writeFile(join(held.home, "runs", held.run, "record.jsonl"), "{bad}\n");
  const invalid = await invokeCli(["run", "events", held.run, "-j"], { home: held.home });
  expect(invalid.code).toBe(5);
  expect(JSON.parse(invalid.err)).toMatchObject({ error: { operation: "run.events", code: "integrity-failed" } });
});

test("run events distinguishes missing, ambiguous, and invalid run storage", async () => {
  const absent = await invokeCli(["run", "events", RUN, "-j"], { home: "/definitely/absent" });
  expect(absent.code).toBe(1);
  expect(JSON.parse(absent.err)).toMatchObject({ error: { cause: "home-missing" } });

  const homeFile = await mkdtemp(join(tmpdir(), "bot-run-events-file-"));
  roots.push(homeFile);
  const notHome = join(homeFile, "home");
  await writeFile(notHome, "not a directory");
  const invalidHome = await invokeCli(["run", "events", RUN, "-j"], { home: notHome });
  expect(invalidHome.code).toBe(4);
  expect(invalidHome.out).toBe("");
  expect(JSON.parse(invalidHome.err)).toMatchObject({ error: { cause: "home-invalid" } });

  const badRuns = await mkdtemp(join(tmpdir(), "bot-run-events-runs-"));
  roots.push(badRuns);
  await writeFile(join(badRuns, "runs"), "not a directory");
  const invalidRuns = await invokeCli(["run", "events", RUN, "-j"], { home: badRuns });
  expect(invalidRuns.code).toBe(4);
  expect(JSON.parse(invalidRuns.err)).toMatchObject({ error: { cause: "runs-invalid" } });

  const held = await fixture();
  const other = join(held.home, "runs", `${held.run}-other`);
  await mkdir(other);
  const ambiguous = await invokeCli(["run", "events", "2026-09-11", "-j"], { home: held.home });
  expect(ambiguous.code).toBe(1);
  expect(JSON.parse(ambiguous.err)).toMatchObject({ error: { cause: "run-ambiguous" } });

  await rm(other, { recursive: true });
  await writeFile(join(held.home, "runs", held.run, "record.jsonl"), Buffer.alloc(1_048_577, 0x20));
  for (const mode of [[], ["-j"]]) {
    const oversized = await invokeCli(["run", "events", held.run, ...mode], { home: held.home });
    expect(oversized.code).toBe(5);
    expect(oversized.out).toBe("");
  }
});

test("run events preflights both finite renderings before writing", async () => {
  const held = await fixture();
  for (const mode of [[], ["-j"]]) {
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    const code = await runEventsCommand([held.run, ...mode], {
      cwd: "/", env: { BOT_HOME: held.home }, resultBytesExclusive: 1,
      stdout: (bytes) => { stdout.push(Buffer.from(bytes)); }, stderr: (bytes) => { stderr.push(Buffer.from(bytes)); },
    });
    expect(code).toBe(5);
    expect(Buffer.concat(stdout)).toEqual(Buffer.alloc(0));
    expect(Buffer.concat(stderr).length).toBeLessThanOrEqual(2_049);
  }
});

test("run events reads only a child authorized by its parent record", async () => {
  const held = await childFixture();

  const reading = await invokeCli(["run", "events", held.run, "--child", CHILD, "-j"], { home: held.home });
  expect(reading.code, reading.err).toBe(0);
  const document = JSON.parse(reading.out) as { data: { run: string; child: string; events: Array<Record<string, unknown>> } };
  expect(document.data).toMatchObject({ run: held.run, child: CHILD });
  expect(document.data.events[0]).toMatchObject({ event: "run_start", run: "1" });

  const current = await invokeCli(["run", "events", held.run, "--child", CHILD], { home: held.home });
  expect(current.code, current.err).toBe(0);
  expect(current.out).toContain("run_start");

  const unrecorded = await invokeCli(["run", "events", held.run, "--child", "stages/01-work/1/1/subflows/2", "-j"], { home: held.home });
  expect(unrecorded.code).toBe(1);
  expect(unrecorded.out).toBe("");
});

test.each([
  ["missing record", async (held: Awaited<ReturnType<typeof childFixture>>) => { await rm(join(held.childDirectory, "record.jsonl")); }, 1, "child-missing"],
  ["request mismatch", async (held: Awaited<ReturnType<typeof childFixture>>) => { await writeFile(join(held.childDirectory, "request.txt"), "changed"); }, 5, "child-disagrees"],
  ["outcome mismatch", async (held: Awaited<ReturnType<typeof childFixture>>) => {
    const path = join(held.childDirectory, "record.jsonl");
    const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
    await writeFile(path, `${lines.slice(0, -1).join("\n")}\n`);
  }, 5, "child-disagrees"],
  ["linked record", async (held: Awaited<ReturnType<typeof childFixture>>) => {
    const path = join(held.childDirectory, "record.jsonl"), outside = join(held.home, "outside-record");
    await writeFile(outside, await readFile(path));
    await rm(path);
    await symlink(outside, path);
  }, 5, "child-invalid"],
] as const)("run events rejects a child with %s", async (_name, arrange, exit, cause) => {
  const held = await childFixture();
  await arrange(held);
  const reading = await invokeCli(["run", "events", held.run, "--child", CHILD, "-j"], { home: held.home });
  expect(reading.code).toBe(exit);
  expect(reading.out).toBe("");
  expect(JSON.parse(reading.err)).toMatchObject({ error: { operation: "run.events", cause } });
});

test("run events converts a synchronous output failure into exit 4", async () => {
  const held = await fixture(), errors: Buffer[] = [];
  const clock: CliBoundary["clock"] = {
    milliseconds: () => 0, timestamp: () => stamp,
    setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
  };
  const code = await main(["run", "events", held.run, "-j"], {
    cwd: "/", env: { BOT_HOME: held.home }, stdinIsTTY: true, stderrIsTTY: false, clock,
    readStdin: () => Promise.resolve(Buffer.alloc(0)), stdout: () => { throw Object.assign(new Error("closed"), { code: "EIO" }); },
    stderr: (bytes) => { errors.push(Buffer.from(bytes)); },
  });
  expect(code).toBe(4);
  expect(JSON.parse(Buffer.concat(errors).toString())).toMatchObject({ error: { operation: "run.events", cause: "EIO" } });
});
