import { chmod, lstat, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { events, realBoundary, runsIn, tempRoots } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

async function assembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  const stage = join(flow, "01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nWrite the answer.\n"),
    writeFile(join(stage, "gate"), "#!/bin/sh\ntest \"$(cat \"$OUTPUT\")\" = answer\n"),
  ]);
  await chmod(join(stage, "gate"), 0o755);
}

async function runStart(
  extra: string[] = [], mode = "-j", stderrIsTTY = false, supplied?: { root: string; home: string },
): Promise<{ code: number; out: Buffer; err: Buffer; home: string; root: string;
  installationBefore: { bytes: Buffer; metadata: { ino: bigint; size: bigint; mode: bigint; mtimeNs: bigint; ctimeNs: bigint } } }> {
  const { root, home } = supplied ?? await roots.scratch("bot-run-start-");
  await assembly(home);
  const script = join(root, "script.json");
  await writeFile(script, JSON.stringify([
    [{ type: "toolCall", id: "write", name: "write", arguments: { path: "$OUTPUT", content: "answer" } }],
    "done",
  ]));
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held } = realBoundary(root, home, out, err, stderrIsTTY);
  const installationPath = join(home, "installation.json");
  const bytes = await readFile(installationPath);
  const before = await stat(installationPath, { bigint: true });
  const installationBefore = { bytes, metadata: {
    ino: before.ino, size: before.size, mode: before.mode, mtimeNs: before.mtimeNs, ctimeNs: before.ctimeNs,
  } };
  const { models: _models, ...boundary } = held;
  const code = await main(["run", "start", "review/main", "request", "--script", "script.json",
    ...(mode.length === 0 ? [] : [mode]), ...extra], boundary);
  return { code, out: Buffer.concat(out), err: Buffer.concat(err), home, root, installationBefore };
}

test("run start returns one complete result from the retained runtime facts", async () => {
  const held = await runStart(["--correlation", "caller-42", "--id-file", "caller-id"]);
  expect(held.code).toBe(0);
  expect(held.err).toEqual(Buffer.alloc(0));
  const document = JSON.parse(held.out.toString()) as { schemaVersion: number; kind: string; data: Record<string, unknown> };
  expect([document.schemaVersion, document.kind]).toEqual([1, "bot.run.result"]);
  expect(document.data).toMatchObject({ complete: true, exit: 0, cause: "success", correlation: "caller-42" });
  const run = String(document.data["run"]);
  const record = await events(join(held.home, "runs", run, "record.jsonl"));
  const start = record[0] ?? {}, end = record.at(-1) ?? {};
  expect(start).toMatchObject({ event: "run_start", run, correlation: "caller-42" });
  expect(document.data).toMatchObject({ startedAt: start["ts"], endedAt: end["ts"] });
  expect(document.data["terminalStage"]).toBeUndefined();
  await expect(readFile(join(held.root, "caller-id"), "utf8")).resolves.toBe(`${run}\n`);
  const output = document.data["output"] as Record<string, unknown>;
  expect(output).toMatchObject({ extension: "txt", bytes: 6, contentIncluded: true, encoding: "utf8", content: "answer" });
  expect(await readFile(join(held.home, "runs", run, String(output["path"])))).toEqual(Buffer.from("answer"));
  const installationPath = join(held.home, "installation.json");
  expect(await readFile(installationPath)).toEqual(held.installationBefore.bytes);
  const after = await stat(installationPath, { bigint: true });
  expect({ ino: after.ino, size: after.size, mode: after.mode, mtimeNs: after.mtimeNs, ctimeNs: after.ctimeNs })
    .toEqual(held.installationBefore.metadata);
});

test("a first run start initializes the home before run birth", async () => {
  const { root, home } = await roots.scratch("bot-run-start-first-use-");
  await assembly(home);
  const script = join(root, "script.json");
  await writeFile(script, JSON.stringify([
    [{ type: "toolCall", id: "write", name: "write", arguments: { path: "$OUTPUT", content: "answer" } }],
    "done",
  ]));
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held } = realBoundary(root, home, out, err);
  await unlink(join(home, "installation.json"));
  const { models: _models, ...boundary } = held;
  const code = await main(["run", "start", "review/main", "request", "--script", script, "-j"], boundary);
  expect(code).toBe(0);
  expect(Buffer.concat(err)).toEqual(Buffer.alloc(0));
  const data = (JSON.parse(Buffer.concat(out).toString()) as { data: Record<string, unknown> }).data;
  expect(data["installationId"]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  const record = await events(join(home, "runs", String(data["run"]), "record.jsonl"));
  expect(record[0]?.["installation_id"]).toBe(data["installationId"]);
  expect((await lstat(join(home, "installation.json"))).mode & 0o777).toBe(0o600);
});

test("concurrent first run starts use one winning installation identity", async () => {
  const { root, home } = await roots.scratch("bot-run-start-concurrent-first-use-");
  await assembly(home);
  const script = join(root, "script.json");
  await writeFile(script, JSON.stringify([
    [{ type: "toolCall", id: "write", name: "write", arguments: { path: "$OUTPUT", content: "answer" } }],
    "done",
  ]));
  const captures = [0, 1].map(() => {
    const out: Buffer[] = [], err: Buffer[] = [];
    const { held } = realBoundary(root, home, out, err);
    const { models: _models, ...boundary } = held;
    return { boundary, out, err };
  });
  await unlink(join(home, "installation.json"));
  const results = await Promise.all(captures.map(async ({ boundary, out, err }) => {
    const code = await main(["run", "start", "review/main", "request", "--script", script, "-j"], boundary);
    return { code, data: (JSON.parse(Buffer.concat(out).toString()) as { data: Record<string, unknown> }).data, err };
  }));
  expect(results.map(({ code }) => code)).toEqual([0, 0]);
  expect(results.every(({ err }) => Buffer.concat(err).length === 0)).toBe(true);
  expect(new Set(results.map(({ data }) => data["installationId"])).size).toBe(1);
  const stored = JSON.parse(await readFile(join(home, "installation.json"), "utf8")) as { data: { id: string } };
  expect(results[0]?.data["installationId"]).toBe(stored.data.id);
});

test("json aliases are byte-identical apart from run-owned identity facts", async () => {
  const long = await runStart([], "--json");
  const short = await runStart([], "-j");
  const normalize = (bytes: Buffer): Record<string, unknown> => {
    const data = (JSON.parse(bytes.toString()) as { data: Record<string, unknown> }).data;
    return { ...data, run: "RUN", startedAt: "START", endedAt: "END" };
  };
  expect(normalize(long.out)).toEqual(normalize(short.out));
});

test("reusing opaque correlation starts another independent run", async () => {
  const where = await roots.scratch("bot-run-start-reused-");
  const first = await runStart(["--correlation", "reused"], "-j", false, where);
  const second = await runStart(["--correlation", "reused"], "-j", false, where);
  const firstData = (JSON.parse(first.out.toString()) as { data: Record<string, unknown> }).data;
  const secondData = (JSON.parse(second.out.toString()) as { data: Record<string, unknown> }).data;
  expect(firstData).toMatchObject({ correlation: "reused", complete: true });
  expect(secondData).toMatchObject({ correlation: "reused", complete: true });
  expect(firstData["run"]).not.toBe(secondData["run"]);
  await expect(runsIn(where.home)).resolves.toHaveLength(2);
});

test("human run start keeps the legacy accepted output bytes", async () => {
  const held = await runStart([], "");
  expect(held.code).toBe(0);
  expect(held.out).toEqual(Buffer.from("answer"));
  expect(held.err).toEqual(Buffer.alloc(0));
});

test("structured run start suppresses terminal progress", async () => {
  const held = await runStart([], "-j", true);
  expect(held.code).toBe(0);
  expect(held.err).toEqual(Buffer.alloc(0));
  expect(JSON.parse(held.out.toString())).toMatchObject({ kind: "bot.run.result" });
});

test("the option marker preserves a dash-prefixed request while options before it still apply", async () => {
  const { root, home } = await roots.scratch("bot-run-start-marker-");
  await assembly(home);
  const script = join(root, "script.json");
  await writeFile(script, JSON.stringify([
    [{ type: "toolCall", id: "write", name: "write", arguments: { path: "$OUTPUT", content: "answer" } }],
    "done",
  ]));
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held } = realBoundary(root, home, out, err);
  const code = await main(["run", "start", "-j", "--script", "script.json", "--", "review/main", "--literal"], held);
  expect(code).toBe(0);
  expect(Buffer.concat(err)).toEqual(Buffer.alloc(0));
  const data = (JSON.parse(Buffer.concat(out).toString()) as { data: Record<string, unknown> }).data;
  await expect(readFile(join(home, "runs", String(data["run"]), "request.txt"), "utf8")).resolves.toBe("--literal");
});

test.each([
  ["repeated", ["--correlation", "a", "--correlation", "b"]],
  ["valueless", ["--correlation"]],
  ["empty", ["--correlation", ""]],
  ["oversized", ["--correlation", "x".repeat(257)]],
])("%s correlation refuses before a run starts", async (_name, extra) => {
  const held = await runStart(extra);
  expect(held.code).toBe(2);
  expect(held.out).toEqual(Buffer.alloc(0));
  expect(JSON.parse(held.err.toString())).toMatchObject({ kind: "error", error: { operation: "run.start" } });
  await expect(runsIn(held.home).catch(() => [])).resolves.toEqual([]);
});

test.each([
  ["--home", "one", "two"], ["--id-file", "one", "two"], ["--in", "one", "two"],
  ["--intelligence", "one", "two"], ["--local-context", "ignore", "use"], ["--retries", "1", "2"],
  ["--script", "one", "two"], ["--timeout", "1", "2"],
] as const)("repeated fixed option %s refuses before a run starts", async (option, first, second) => {
  const held = await runStart([option, first, option, second]);
  expect(held.code).toBe(2);
  expect(held.out).toEqual(Buffer.alloc(0));
  expect(JSON.parse(held.err.toString())).toMatchObject({
    kind: "error", error: { operation: "run.start", cause: "option-repeated" },
  });
  await expect(runsIn(held.home).catch(() => [])).resolves.toEqual([]);
});

test("capabilities and help advertise the implemented mutation", async () => {
  const held = await runStart(["--correlation", "capability-fixture"]);
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held: boundary } = realBoundary("/", held.home, out, err);
  await main(["capabilities", "-j"], boundary);
  const capabilities = JSON.parse(Buffer.concat(out).toString()) as { data: { commands: Array<Record<string, unknown>> } };
  expect(capabilities.data.commands.find((item) => item["operation"] === "run.start"))
    .toMatchObject({ operation: "run.start", home: "writes", mutates: true, network: "conditional" });
  out.length = 0;
  await main(["run", "start", "--help"], boundary);
  expect(Buffer.concat(out).toString()).toContain("usage: bot run start");
});

test("a pre-run refusal uses the common error and creates no run", async () => {
  const { root, home } = await roots.scratch("bot-run-start-refusal-");
  await mkdir(home, { recursive: true });
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held } = realBoundary(root, home, out, err);
  const code = await main(["run", "start", "missing/main", "request", "-j"], held);
  expect(code).toBe(2);
  expect(Buffer.concat(out)).toEqual(Buffer.alloc(0));
  expect(JSON.parse(Buffer.concat(err).toString())).toMatchObject({
    kind: "error", error: { operation: "run.start", cause: "run-refused" },
  });
  await expect(runsIn(home).catch(() => [])).resolves.toEqual([]);
});

test("an unexpected pre-run dependency failure retains its immediate typed cause", async () => {
  const { root, home } = await roots.scratch("bot-run-start-dependency-");
  await assembly(home);
  const out: Buffer[] = [], err: Buffer[] = [];
  const { held } = realBoundary(root, home, out, err);
  const code = await main(["run", "start", "review/main", "request", "--script", "missing.json", "-j"], held);
  expect(code).toBe(4);
  expect(Buffer.concat(out)).toEqual(Buffer.alloc(0));
  expect(JSON.parse(Buffer.concat(err).toString())).toMatchObject({
    kind: "error", error: { code: "dependency-failed", operation: "run.start", cause: "ENOENT", retryable: true },
  });
  await expect(runsIn(home).catch(() => [])).resolves.toEqual([]);
});
