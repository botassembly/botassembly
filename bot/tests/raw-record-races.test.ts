import { spawn } from "node:child_process";
import { closeSync, createWriteStream, openSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import { afterEach, expect, test, vi } from "vitest";
import { processRawStdout } from "../src/process-output.ts";

type RaceMode = "" | "before-open" | "after-open" | "append" | "short" | "error" | "close-error";
const race = vi.hoisted((): { path: string; mode: RaceMode; reads: number; closes: number } => ({ path: "", mode: "", reads: 0, closes: 0 }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  const { Readable } = await import("node:stream");
  return {
    ...original,
    open: async (...arguments_: Parameters<typeof original.open>) => {
      const path = arguments_[0].toString();
      if (path === race.path && race.mode === "before-open") {
        await original.rename(path, `${path}.old`);
        await original.writeFile(path, "replacement");
      }
      const descriptor = await original.open(...arguments_);
      if (path !== race.path) return descriptor;
      if (race.mode === "after-open") {
        await original.rename(path, `${path}.old`);
        await original.writeFile(path, "replacement");
      }
      return {
        stat: async () => {
          const held = await descriptor.stat();
          if (race.mode === "append") await original.appendFile(path, "later");
          return held;
        },
        createReadStream: (options: Parameters<typeof descriptor.createReadStream>[0]) => {
          if (race.mode !== "short" && race.mode !== "error") {
            const source = descriptor.createReadStream(options);
            source.on("data", () => { race.reads += 1; });
            return source;
          }
          let sent = false;
          const source = new Readable({
            read() {
              if (sent) return;
              sent = true;
              race.reads += 1;
              this.push(Buffer.from("ori"));
              if (race.mode === "error") this.destroy(Object.assign(new Error("injected read failure"), { code: "EIO" }));
              else this.push(null);
            },
          });
          Object.defineProperty(source, "bytesRead", { value: 3 });
          return source;
        },
        close: async () => {
          race.closes += 1;
          await descriptor.close();
          if (race.mode === "close-error") throw Object.assign(new Error("injected close failure"), { code: "EBADF" });
        },
        read: async (buffer: NodeJS.ArrayBufferView, offset: number, length: number, position: number) => {
          race.reads += 1;
          if ((race.mode === "short" || race.mode === "error") && race.reads === 1) {
            return descriptor.read(buffer, offset, Math.min(length, 3), position);
          }
          if (race.mode === "short") return { bytesRead: 0, buffer };
          if (race.mode === "error") throw Object.assign(new Error("injected read failure"), { code: "EIO" });
          return descriptor.read(buffer, offset, length, position);
        },
      };
    },
  };
});

import { cliPath } from "./boundary.ts";
import { invokeCliBytes } from "./invoke.ts";
import { copyHeldRunFile, holdRunFile } from "../src/run-files.ts";
import { hashBytes } from "../src/record.ts";

const roots: string[] = [];
const RUN = "2026-09-05T11-00-00-b009";

function stream(write: (bytes: Uint8Array) => void | Promise<void>): () => Writable {
  return () => new Writable({
    write: (bytes: Buffer, _encoding, done) => {
      Promise.resolve().then(() => write(bytes)).then(
        () => { done(); },
        (reason: unknown) => { done(reason instanceof Error ? reason : new Error("Injected writer failed.")); },
      );
    },
  });
}

afterEach(async () => {
  race.path = "";
  race.mode = "";
  race.reads = 0;
  race.closes = 0;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(bytes: string | Uint8Array = "original bytes"): Promise<{ home: string; record: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-raw-race-"));
  roots.push(root);
  const home = join(root, "home");
  const record = join(home, "runs", RUN, "record.jsonl");
  await mkdir(join(record, ".."), { recursive: true });
  await writeFile(record, bytes);
  race.path = record;
  return { home, record };
}

test("raw access rejects replacement before open without publishing bytes", async () => {
  const where = await fixture();
  race.mode = "before-open";
  const held = await invokeCliBytes(["run", "record", RUN, "--raw"], { home: where.home });
  expect(held.code).toBe(1);
  expect(held.out).toEqual(Buffer.alloc(0));
  expect(held.err.length).toBeGreaterThan(0);
});

test("raw access keeps the opened descriptor when the path is replaced after open", async () => {
  const where = await fixture();
  race.mode = "after-open";
  const held = await invokeCliBytes(["run", "record", RUN, "--raw"], { home: where.home });
  expect([held.code, held.out.toString(), held.err.toString()]).toEqual([0, "original bytes", ""]);
});

test("raw access copies only the descriptor size observed at open and does not chase appends", async () => {
  const where = await fixture();
  race.mode = "append";
  const held = await invokeCliBytes(["run", "record", RUN, "--raw"], { home: where.home });
  expect([held.code, held.out.toString(), held.err.toString()]).toEqual([0, "original bytes", ""]);
});

const interruptedModes: RaceMode[] = ["short", "error"];

test.each(interruptedModes)("raw access retains partial stdout on a midstream %s", async (mode) => {
  const where = await fixture();
  race.mode = mode;
  const held = await invokeCliBytes(["run", "record", RUN, "--raw"], { home: where.home });
  expect(held.code).toBe(1);
  expect(held.out.toString()).toBe("ori");
  expect(held.err.toString()).toMatch(/record.*read/iu);
});

test("the raw CLI waits for one stdout chunk before it reads or submits the next", async () => {
  const where = await fixture(Buffer.concat([Buffer.alloc(64 * 1024, "a"), Buffer.alloc(64 * 1024, "b")]));
  let release = (): void => undefined;
  let observed = (): void => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const first = new Promise<void>((resolve) => { observed = resolve; });
  const chunks: Buffer[] = [];
  const running = invokeCliBytes(["run", "record", RUN, "--raw"], { home: where.home, rawStdout: async (bytes) => {
    chunks.push(Buffer.from(bytes));
    if (chunks.length === 1) { observed(); await held; }
  } });
  const boundary = await Promise.race([first.then(() => "blocked"), running.then(() => "finished")]);
  expect(boundary).toBe("blocked");
  expect(chunks).toHaveLength(1);
  release();
  const result = await running;
  expect([result.code, chunks.length]).toEqual([0, 2]);
});

test("a rejected raw writer keeps prior stdout, reports interruption, and closes the descriptor", async () => {
  const where = await fixture(Buffer.concat([Buffer.alloc(64 * 1024, "a"), Buffer.alloc(64 * 1024, "b")]));
  const chunks: Buffer[] = [];
  const failure = Object.assign(new Error("injected stdout rejection"), { code: "ENOSPC" });
  const result = await invokeCliBytes(["run", "record", RUN, "--raw"], { home: where.home, rawStdout: (bytes) => {
    if (chunks.length > 0) return Promise.reject(failure);
    chunks.push(Buffer.from(bytes));
    return Promise.resolve();
  } });
  expect(result.code).toBe(1);
  expect(Buffer.concat(chunks)).toEqual(Buffer.alloc(64 * 1024, "a"));
  expect(result.err.toString()).toMatch(/stdout delivery \(ENOSPC\)/u);
  expect(race.closes).toBe(1);
});

test.each([
  ["error" as const, "input read", "EIO"],
  ["close-error" as const, "descriptor close", "EBADF"],
])("the raw CLI reports a bounded %s failure and closes the descriptor", async (mode, phase, code) => {
  const where = await fixture("original bytes");
  race.mode = mode;
  const result = await invokeCliBytes(["run", "record", RUN, "--raw"], { home: where.home });
  expect(result.code).toBe(1);
  expect(result.err.toString()).toMatch(new RegExp(`${phase} \\(${code}\\)`, "u"));
  expect(result.err.length).toBeLessThan(160);
  expect(result.err.toString()).not.toMatch(/\n\s+at /u);
  expect(race.closes).toBe(1);
});

test("the process stdout adapter restores error listeners after clean completion", async () => {
  const listeners = process.stdout.listeners("error");
  const output = processRawStdout();
  output.end();
  await finished(output);
  expect(process.stdout.listeners("error")).toEqual(listeners);
});

test("the process stdout adapter restores error listeners after destruction", async () => {
  const listeners = process.stdout.listeners("error");
  const output = processRawStdout();
  const failure = new Error("injected output failure");
  const settled = finished(output);
  output.destroy(failure);
  await expect(settled).rejects.toBe(failure);
  expect(process.stdout.listeners("error")).toEqual(listeners);
});

test("the real CLI owns a /dev/full stdout failure and reports it without a stack", async () => {
  const where = await fixture(Buffer.alloc(128 * 1024, "x"));
  const full = openSync("/dev/full", "w");
  const child = spawn(process.execPath, [cliPath, "run", "record", RUN, "--raw"], {
    env: { ...process.env, BOT_HOME: where.home },
    stdio: ["ignore", full, "pipe"],
  });
  closeSync(full);
  const stderr: Buffer[] = [];
  if (child.stderr === null) throw new Error("stderr pipe was not created");
  child.stderr.on("data", (bytes: Buffer) => stderr.push(bytes));
  const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("close", (code, signal) => { resolve({ code, signal }); });
  });
  const diagnostic = Buffer.concat(stderr).toString();
  expect(outcome).toEqual({ code: 1, signal: null });
  expect(diagnostic).toMatch(/stdout delivery \(ENOSPC\)/u);
  expect(diagnostic.length).toBeLessThan(160);
  expect(diagnostic).not.toMatch(/\n\s+at /u);
});

test("the real CLI keeps a closed raw-output pipe quiet", async () => {
  const where = await fixture(Buffer.alloc(8 * 1024 * 1024, "x"));
  const child = spawn("bash", ["-o", "pipefail", "-c", '"$1" "$2" run record "$3" --raw | head -c 0',
    "bash", process.execPath, cliPath, RUN], {
    env: { ...process.env, BOT_HOME: where.home },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  child.stdout.on("data", (bytes: Buffer) => stdout.push(bytes));
  child.stderr.on("data", (bytes: Buffer) => stderr.push(bytes));
  const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("close", (code, signal) => { resolve({ code, signal }); });
  });
  expect(outcome).toEqual({ code: 0, signal: null });
  expect(Buffer.concat(stdout)).toEqual(Buffer.alloc(0));
  expect(Buffer.concat(stderr)).toEqual(Buffer.alloc(0));
});

test("the real CLI completes exact output after its reader resumes", async () => {
  const bytes = Buffer.alloc(1024 * 1024, "x");
  const where = await fixture(bytes);
  const child = spawn(process.execPath, [cliPath, "run", "record", RUN, "--raw"], {
    env: { ...process.env, BOT_HOME: where.home },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  child.stdout.pause();
  child.stdout.on("data", (chunk: Buffer) => { stdout.push(chunk); });
  child.stderr.on("data", (chunk: Buffer) => { stderr.push(chunk); });
  let closed = false;
  const completed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("close", (code, signal) => { closed = true; resolve({ code, signal }); });
  });
  await new Promise<void>((resolve) => { setTimeout(resolve, 2_000); });
  expect(closed).toBe(false);
  child.stdout.resume();
  const outcome = await completed;
  expect(outcome).toEqual({ code: 0, signal: null });
  const delivered = Buffer.concat(stdout);
  expect(delivered.length).toBe(bytes.length);
  expect(delivered.equals(bytes)).toBe(true);
  expect(Buffer.concat(stderr)).toEqual(Buffer.alloc(0));
});

test.each([
  ["error" as const, "injected read failure"],
  ["close-error" as const, "injected close failure"],
])("a validated descriptor maps %s to interrupted with the underlying error", async (mode, message) => {
  const where = await fixture("original bytes");
  race.mode = mode;
  const result = await copyHeldRunFile(join(where.record, ".."), "record.jsonl", stream(() => {}));
  expect(result.kind).toBe("interrupted");
  if (result.kind === "interrupted") {
    expect(result.error).toMatchObject({ message });
    expect(result.phase).toBe(mode === "error" ? "read" : "close");
  }
  expect(race.closes).toBe(1);
});

test("a validated descriptor maps writer rejection to interrupted with the underlying error", async () => {
  const where = await fixture("original bytes");
  const failure = Object.assign(new Error("injected writer failure"), { code: "ENOSPC" });
  const result = await copyHeldRunFile(join(where.record, ".."), "record.jsonl", stream(() => Promise.reject(failure)));
  expect(result).toMatchObject({ kind: "interrupted", phase: "write", error: failure });
  expect(race.closes).toBe(1);
});

test.each(["short", "error", "close-error"] as const)(
  "a held source reports a later %s while copying and closes its descriptor",
  async (mode) => {
    const where = await fixture("original bytes");
    const held = await holdRunFile(join(where.record, ".."), "record.jsonl");
    if (!("copy" in held)) throw new Error("fixture did not produce a held source");
    race.reads = 0;
    race.mode = mode;
    const result = await held.copy(stream(() => {}));
    expect(result.kind).toBe("interrupted");
    if (result.kind === "interrupted") expect(result.phase).toBe(mode === "close-error" ? "close" : "read");
    expect(race.closes).toBe(1);
  },
);

test("a held source closes its descriptor when initial hashing fails", async () => {
  const where = await fixture("original bytes");
  race.mode = "error";
  await expect(holdRunFile(join(where.record, ".."), "record.jsonl")).resolves.toMatchObject({ kind: "unreadable" });
  expect(race.closes).toBe(1);
});

test("a held source reports a later destination failure and closes its descriptor", async () => {
  const where = await fixture("original bytes");
  const held = await holdRunFile(join(where.record, ".."), "record.jsonl");
  if (!("copy" in held)) throw new Error("fixture did not produce a held source");
  const failure = Object.assign(new Error("injected writer failure"), { code: "ENOSPC" });
  const result = await held.copy(stream(() => Promise.reject(failure)));
  expect(result).toMatchObject({ kind: "interrupted", phase: "write", error: failure });
  expect(race.closes).toBe(1);
});

test.each(["direct", "held"] as const)("a %s zero-byte copy creates one empty destination", async (kind) => {
  const where = await fixture("");
  const destination = join(where.record, "..", `${kind}.txt`);
  const create = () => createWriteStream(destination, { flags: "wx" });
  const result = kind === "direct"
    ? await copyHeldRunFile(join(where.record, ".."), "record.jsonl", create)
    : await holdRunFile(join(where.record, ".."), "record.jsonl").then(async (held) => {
        if (!("copy" in held)) throw new Error("fixture did not produce a held source");
        return held.copy(create);
      });
  expect(result).toEqual({ kind: "copied", size: 0, sha256: hashBytes(Buffer.alloc(0)) });
  await expect(readFile(destination)).resolves.toEqual(Buffer.alloc(0));
  expect(race.closes).toBe(1);
});

test.each(["direct", "held"] as const)("a %s destination-construction failure closes once", async (kind) => {
  const where = await fixture("original bytes");
  const failure = Object.assign(new Error("destination construction failed"), { code: "ENOSPC" });
  const create = (): Writable => { throw failure; };
  const result = kind === "direct"
    ? await copyHeldRunFile(join(where.record, ".."), "record.jsonl", create)
    : await holdRunFile(join(where.record, ".."), "record.jsonl").then(async (held) => {
        if (!("copy" in held)) throw new Error("fixture did not produce a held source");
        return held.copy(create);
      });
  expect(result).toMatchObject({ kind: "interrupted", phase: "write", error: failure });
  expect(race.closes).toBe(1);
});
