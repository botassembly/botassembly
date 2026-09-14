// Ticket 0017 F4 — the CLI exit path. After a complete run the process
// sometimes never exited: a lingering provider handle (pi-ai keep-alive
// socket, no public close) held the event loop while cli.ts trusted drain.
// exitFlushed exits explicitly, but only after both stdio streams confirm
// their flush — proven here by piping megabytes through a child process that
// carries a deliberately lingering handle and still seeing every byte AND a
// prompt exit. A bare process.exit() fails the byte count (65,536 of 8 MiB in
// the scripted reproduction).
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { exitFlushed, main, platformRefusal, type CliBoundary } from "../src/cli.ts";
import { BOUNDARY_MS, cliPath, piped, spawned } from "./boundary.ts";
import { currentRecord } from "./current-record.ts";

const roots: string[] = [];
const windows = "Bot does not support native Windows. Install WSL and run Bot inside its Linux shell.\n";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function refusing(platform: string): { boundary: CliBoundary; out: string[]; err: string[]; touched: ReturnType<typeof vi.fn> } {
  const out: string[] = [], err: string[] = [], touched = vi.fn();
  const boundary = {
    platform, cwd: "/never", env: {}, stdinIsTTY: false, stderrIsTTY: false,
    get readStdin() { touched(); return () => Promise.resolve(Buffer.alloc(0)); },
    get clock() {
      touched();
      return { milliseconds: () => 0, timestamp: () => "", setTimeout, clearTimeout };
    },
    stdout: (bytes: string | Uint8Array) => { out.push(bytes.toString()); },
    stderr: (bytes: string | Uint8Array) => { err.push(bytes.toString()); },
  } as CliBoundary;
  return { boundary, out, err, touched };
}

test.each([{ argv: [] }, { argv: ["--help"] }, { argv: ["capabilities"] }, { argv: ["run", "start"] }])("native Windows refuses $argv before command work", async ({ argv }) => {
  const held = refusing("win32");
  await expect(main(argv, held.boundary)).resolves.toBe(2);
  expect(held.out).toEqual([]);
  expect(held.err).toEqual([windows]);
  expect(held.touched).not.toHaveBeenCalled();
});

test.each(["linux", "darwin"])("%s reaches ordinary help and command dispatch", async (platform) => {
  const out: string[] = [], err: string[] = [];
  const boundary: CliBoundary = {
    platform, cwd: "/", env: {}, stdinIsTTY: false, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { out.push(bytes.toString()); }, stderr: (bytes) => { err.push(bytes.toString()); },
    clock: { milliseconds: () => 0, timestamp: () => "2026-09-13T00:00:00.000Z", setTimeout, clearTimeout },
  };
  await expect(main(["--help"], boundary)).resolves.toBe(0);
  expect(out.join("")).toMatch(/\nusage: bot /u);
  out.length = 0;
  await expect(main(["unknown"], boundary)).resolves.toBe(2);
  expect(err.join("")).toMatch(/^request-invalid/u);
});

test("another platform gets the generic refusal", () => {
  expect(platformRefusal("aix")).toBe("Bot does not support aix. Run Bot on Linux or macOS.\n");
});

test("exitFlushed exits despite a lingering handle and delivers every piped byte", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-exit-"));
  roots.push(root);
  const harness = join(root, "harness.mjs");
  await writeFile(harness, [
    `import { exitFlushed } from ${JSON.stringify(cliPath)};`,
    "setInterval(() => {}, 60_000); // the lingering handle F4 describes",
    "const chunk = \"x\".repeat(1 << 20);",
    "for (let i = 0; i < 8; i += 1) process.stdout.write(chunk);",
    "process.stderr.write(\"kept\");",
    "exitFlushed(0);",
    "",
  ].join("\n"));
  const result = await piped([harness], process.env);
  expect(result.code, result.stderr.toString()).toBe(0);
  expect(result.stdout.length).toBe(8 << 20);
  expect(result.stderr.toString("utf8")).toBe("kept");
}, BOUNDARY_MS);

test("the real CLI exits after piping a large inspection output complete", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-exit-real-"));
  roots.push(root);
  const run = join(root, "home", "runs", "2026-08-01T11-00-00-f00d");
  await mkdir(run, { recursive: true });
  const events: Record<string, unknown>[] = [
    { record: 1, ts: "2026-08-01T11:00:00.000Z", event: "run_start", run: "2026-08-01T11-00-00-f00d", assembly: "a", flow: "main" },
    { ts: "2026-08-01T11:00:00.000Z", event: "stage_start", stage: "01-work", retry: 1 },
    ...Array.from({ length: 1_000 }, () => ({ ts: "2026-08-01T11:00:00.000Z", event: "turn", stage: "01-work", retry: 1, provider: "faux", model: "faux-1", input: 0, output: 0, cache_read: 0, cache_write: 0, total: 0, stop: "stop", filler: "z".repeat(512) })),
    { ts: "2026-08-01T11:00:01.000Z", event: "stage_end", stage: "01-work", retry: 1, exit: 0, cause: "success" },
    { ts: "2026-08-01T11:00:02.000Z", event: "run_end", exit: 0, cause: "success" },
  ];
  const bytes = currentRecord(events);
  await writeFile(join(run, "record.jsonl"), bytes);
  const result = await piped([cliPath, "run", "record", "2026-08-01T11-00-00", "--raw"], { ...process.env, BOT_HOME: join(root, "home") });
  expect(result.code, result.stderr.toString()).toBe(0);
  expect(result.stdout.length).toBe(Buffer.byteLength(bytes));
}, BOUNDARY_MS);

test("a real bounded JSON reading settles through ordinary stdout", async () => {
  const result = await piped([cliPath, "capabilities", "-j"], process.env);
  expect(result.code, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString()) as unknown).toMatchObject({ kind: "bot.capabilities" });
  expect(result.stdout.length).toBeLessThan(1 << 20);
  expect(result.stderr).toEqual(Buffer.alloc(0));
}, BOUNDARY_MS);

test("a paused ordinary reader receives every byte in order before exit", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-cli-paused-output-"));
  roots.push(root);
  const harness = join(root, "harness.mjs");
  await writeFile(harness, [
    `import { processBoundary } from ${JSON.stringify(cliPath)};`,
    `import { exitFlushed } from ${JSON.stringify(new URL("../src/process-output.ts", import.meta.url).pathname)};`,
    "const boundary = processBoundary();",
    "boundary.stdout('a'.repeat(4 << 20));",
    "boundary.stdout('b'.repeat(4 << 20));",
    "exitFlushed(0);",
    "",
  ].join("\n"));
  const child = spawn(process.execPath, [harness], { stdio: ["ignore", "pipe", "pipe"] });
  const output: Buffer[] = [], errors: Buffer[] = [];
  child.stdout.pause();
  child.stdout.on("data", (bytes: Buffer) => { output.push(bytes); });
  child.stderr.on("data", (bytes: Buffer) => { errors.push(bytes); });
  let closed = false;
  child.once("close", () => { closed = true; });
  await new Promise<void>((resolve) => { setTimeout(resolve, 50); });
  expect(closed).toBe(false);
  child.stdout.resume();
  const code = await new Promise<number | null>((resolve) => { child.once("close", resolve); });
  expect(code, Buffer.concat(errors).toString()).toBe(0);
  const observed = Buffer.concat(output);
  expect(observed.length).toBe(8 << 20);
  expect(observed.subarray(0, 4 << 20).every((byte) => byte === 0x61)).toBe(true);
  expect(observed.subarray(4 << 20).every((byte) => byte === 0x62)).toBe(true);
}, BOUNDARY_MS);

test("exitFlushed is the exported exit seam", () => {
  expect(typeof exitFlushed).toBe("function");
});

test.skipIf(!existsSync("/dev/full"))("ordinary help reports /dev/full once without a stack", async () => {
  const full = openSync("/dev/full", "w");
  const child = spawn(process.execPath, [cliPath, "--help"], { stdio: ["ignore", full, "pipe"] });
  closeSync(full);
  const errors: Buffer[] = [];
  child.stderr?.on("data", (bytes: Buffer) => { errors.push(bytes); });
  const code = await new Promise<number | null>((resolve) => { child.once("close", resolve); });
  const diagnostic = Buffer.concat(errors).toString();
  expect(code).toBe(1);
  expect(diagnostic).toBe("Bot failed during stdout delivery (ENOSPC).\n");
  expect(diagnostic).not.toMatch(/\n\s+at /u);
}, BOUNDARY_MS);

test("ordinary help treats an early-closing reader as quiet success", async () => {
  const running = spawned([cliPath, "--help"], process.env);
  running.child.stdout?.destroy();
  await expect(running.ended).resolves.toEqual({
    code: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0),
  });
}, BOUNDARY_MS);
