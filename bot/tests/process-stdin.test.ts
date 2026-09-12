import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { readByteStream } from "../src/stdin.ts";
import { boundaryFor, cleanup, scratch, tree, type Capture } from "./assembly-home.ts";
import { BOUNDARY_MS, CHILD_MS } from "./boundary.ts";

const childPath = fileURLToPath(new URL("./process-stdin-child.ts", import.meta.url));
const roots: string[] = [];

afterEach(async () => {
  await Promise.all([cleanup(), ...roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))]);
});

test("process stdin waits for delayed EOF and preserves hostile chunks byte for byte", async () => {
  const child = spawn(process.execPath, [childPath], { stdio: ["pipe", "pipe", "pipe"] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let ready = "";
  const sawReady = new Promise<void>((resolve, reject) => {
    let marked = false;
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
      ready += chunk.toString("utf8");
      if (ready.includes("BOT_STDIN_READY\n")) { marked = true; resolve(); }
    });
    child.once("close", () => { if (!marked) reject(new Error("stdin child exited before its ready marker")); });
  });
  child.stderr.on("data", (chunk: Buffer) => { stderr.push(chunk); });
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on("close", (code, signal) => { resolve({ code, signal }); });
  });
  const guard = setTimeout(() => { child.kill("SIGKILL"); }, CHILD_MS);

  await sawReady;
  const chunks = [Buffer.from([0x61, 0x00, 0xff]), Buffer.from([0xc3, 0x28, 0x62])];
  await delay(20);
  child.stdin.write(chunks[0]);
  await delay(20);
  child.stdin.write(chunks[1]);
  await delay(20);
  child.stdin.end();

  const result = await ended;
  clearTimeout(guard);
  expect(Buffer.concat(stderr).toString("utf8")).toBe("");
  expect(result).toEqual({ code: 0, signal: null });
  expect(Buffer.concat(stdout).toString("utf8")).toBe(
    `BOT_STDIN_READY\nBOT_STDIN_BYTES=${Buffer.concat(chunks).toString("base64")}\n`,
  );
}, BOUNDARY_MS);

const listenerEvents = ["data", "end", "error"] as const;

function listenerCounts(stream: PassThrough): number[] {
  return listenerEvents.map((event) => stream.listenerCount(event));
}

test("the byte consumer removes its listeners after clean end", async () => {
  const stream = new PassThrough();
  const before = listenerCounts(stream);
  const read = readByteStream(stream);
  stream.write(Buffer.from([0x61, 0x00]));
  stream.end(Buffer.from([0xff, 0x62]));
  await expect(read).resolves.toEqual(Buffer.from([0x61, 0x00, 0xff, 0x62]));
  expect(listenerCounts(stream)).toEqual(before);
});

test("the byte consumer rejects a partial stream and removes its listeners", async () => {
  const stream = new PassThrough();
  const before = listenerCounts(stream);
  const read = readByteStream(stream);
  stream.write(Buffer.from([0x61, 0x00, 0xff]));
  stream.destroy(new Error("partial input failed"));
  await expect(read).rejects.toThrow("partial input failed");
  expect(listenerCounts(stream)).toEqual(before);
});

test("the byte consumer reports the real createReadStream directory error", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-stdin-directory-"));
  roots.push(root);
  await expect(readByteStream(createReadStream(root))).rejects.toMatchObject({ code: "EISDIR" });
});

test("a rejected stdin read creates no run", async () => {
  const held = await scratch("bot-stdin-rejected-");
  await tree(join(held.home, "assemblies/review"), "Read stdin.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  boundary.stdinIsTTY = false;
  boundary.readStdin = () => Promise.reject(new Error("stdin failed"));
  await expect(main(["run", "start", "review/main"], boundary)).resolves.toBe(4);
  expect(Buffer.concat(capture.err).toString()).toContain("stdin failed");
  await expect(readdir(join(held.home, "runs"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("clean empty EOF remains no request and creates no run", async () => {
  const held = await scratch("bot-stdin-empty-");
  await tree(join(held.home, "assemblies/review"), "Read stdin.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  boundary.stdinIsTTY = false;
  boundary.readStdin = () => Promise.resolve(Buffer.alloc(0));
  await expect(main(["run", "start", "review/main"], boundary)).resolves.toBe(2);
  expect(Buffer.concat(capture.err).toString()).toContain("request-invalid  review/main");
  await expect(readdir(join(held.home, "runs"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("a terminal bypasses the stdin reader", async () => {
  const held = await scratch("bot-stdin-terminal-");
  await tree(join(held.home, "assemblies/review"), "Read stdin.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  let read = false;
  boundary.readStdin = () => { read = true; return Promise.reject(new Error("terminal stdin was read")); };
  await expect(main(["run", "start", "review/main"], boundary)).resolves.toBe(2);
  expect(read).toBe(false);
  expect(Buffer.concat(capture.err).toString()).toContain("request-invalid  review/main");
  await expect(readdir(join(held.home, "runs"))).rejects.toMatchObject({ code: "ENOENT" });
});
