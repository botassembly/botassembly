import { createHash } from "node:crypto";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import { runRequestCommand } from "../src/run-output-command.ts";
import type { HeldRunSource } from "../src/run-files.ts";
import { realBoundary, tempRoots, writes } from "./cli-boundary.ts";
import { currentRecord } from "./current-record.ts";
import { invokeCliBytes } from "./invoke.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());
const RUN = "2026-09-06T12-00-00-a034";

async function retained(home: string, bytes: Buffer, recorded: { bytes?: number; sha256?: string } = {}): Promise<string> {
  const directory = join(home, "runs", RUN), path = "request.md";
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, path), bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(join(directory, "record.jsonl"), currentRecord([{
    record: 1, event: "run_start", ts: "2026-09-06T12:00:00.000Z", run: RUN,
    assembly: "review", assembly_hash: "a".repeat(64), flow: "main",
    request: { path, sha256: recorded.sha256 ?? sha256, bytes: recorded.bytes ?? bytes.length, via: "stdin" },
  }]));
  return directory;
}

test("run request returns a large retained request", async () => {
  const { home } = await roots.scratch("bot-run-request-large-");
  const bytes = Buffer.alloc(1_048_577, "r");
  await retained(home, bytes);
  await expect(invokeCliBytes(["run", "request", RUN, "--raw"], { home }))
    .resolves.toEqual({ code: 0, out: bytes, err: Buffer.alloc(0) });
});

test("run request retrieves a large request retained by a real run", async () => {
  const { root, home } = await roots.scratch("bot-run-request-real-");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-answer.md"), "---\n---\nAnswer.\n"),
  ]);
  const request = "r".repeat(1_048_577), out: Buffer[] = [], err: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, out, err);
  faux.setResponses([writes("$OUTPUT", "answer"), fauxAssistantMessage("done")]);
  expect(await main(["run", "start", "review/main", request, "-j"], held)).toBe(0);
  const run = (JSON.parse(Buffer.concat(out).toString()) as { data: { run: string } }).data.run;
  await expect(invokeCliBytes(["run", "request", run, "--raw"], { home }))
    .resolves.toEqual({ code: 0, out: Buffer.from(request), err: Buffer.alloc(0) });
});

test.each([Buffer.alloc(0), Buffer.from([0, 0xff, 0x7c])])("run request keeps empty and binary bytes exact", async (bytes) => {
  const { home } = await roots.scratch("bot-run-request-bytes-");
  await retained(home, bytes);
  const noun = await invokeCliBytes(["run", "request", RUN, "--raw"], { home });
  expect(noun).toEqual({ code: 0, out: bytes, err: Buffer.alloc(0) });
});

test("run request refuses missing, linked, non-file, changed, and size-disagreeing requests before stdout", async () => {
  const cases: Array<(home: string) => Promise<void>> = [
    async (home) => { const directory = await retained(home, Buffer.from("original")); await rm(join(directory, "request.md")); },
    async (home) => { const directory = await retained(home, Buffer.from("original")); await rm(join(directory, "request.md")); await symlink("other", join(directory, "request.md")); },
    async (home) => { const directory = await retained(home, Buffer.from("original")); await rm(join(directory, "request.md")); await mkdir(join(directory, "request.md")); },
    async (home) => { const directory = await retained(home, Buffer.from("original")); await writeFile(join(directory, "request.md"), "changed!"); },
    async (home) => { await retained(home, Buffer.from("original"), { bytes: 9 }); },
  ];
  for (const prepare of cases) {
    const { home } = await roots.scratch("bot-run-request-refusal-");
    await prepare(home);
    const result = await invokeCliBytes(["run", "request", RUN, "--raw"], { home });
    expect(result.code).toBe(1);
    expect(result.out).toEqual(Buffer.alloc(0));
    expect(result.err.length).toBeGreaterThan(0);
  }
});

test("malformed run request flags fail before reading the home", async () => {
  const env: NodeJS.ProcessEnv = {};
  Object.defineProperty(env, "BOT_HOME", { get: () => { throw new Error("home was read"); } });
  const out: Buffer[] = [], err: Buffer[] = [];
  const boundary: CliBoundary = {
    cwd: "/", env, stdinIsTTY: true, stderrIsTTY: false, readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { out.push(Buffer.from(bytes)); }, stderr: (bytes) => { err.push(Buffer.from(bytes)); },
    clock: { milliseconds: () => 0, timestamp: () => "2026-09-06T12:00:00.000Z",
      setTimeout: () => ({ clear: () => undefined }), clearTimeout: () => undefined },
  };
  const invalid = [[], [RUN], [RUN, "--raw", "--raw"], [RUN, "--raw", "--unknown"],
    [RUN, "extra", "--raw"], [RUN, "--raw", "--home"], [RUN, "--raw", "--home", "/one", "--home", "/two"]];
  for (const args of invalid) await expect(main(["run", "request", ...args], boundary)).resolves.toBe(2);
  expect(out).toEqual([]);
  expect(err).toHaveLength(invalid.length);
});

test("run request names a bounded delivery fault", async () => {
  const { home } = await roots.scratch("bot-run-request-fault-");
  const bytes = Buffer.from("original");
  await retained(home, bytes);
  const failure = Object.assign(new Error("full"), { code: "ENOSPC" });
  const source: HeldRunSource = {
    size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
    close: () => Promise.resolve(),
    copy: () => Promise.resolve({ kind: "interrupted", phase: "write", error: failure }),
  };
  const out: Buffer[] = [], err: Buffer[] = [];
  const code = await runRequestCommand([RUN, "--raw", "--home", home], {
    cwd: "/", env: {}, stdout: (value) => out.push(Buffer.from(value)),
    rawStdout: () => new Writable(), stderr: (value) => err.push(Buffer.from(value)),
  }, { holdSource: () => Promise.resolve(source) });
  expect(code).toBe(1);
  expect(out).toEqual([]);
  expect(Buffer.concat(err).toString()).toBe("Run request failed during delivery: ENOSPC.\n");
  expect(Buffer.concat(err).length).toBeLessThanOrEqual(2_048);
});

test("capabilities and help publish the raw network-free request command", async () => {
  const { home } = await roots.scratch("bot-run-request-help-");
  const capabilities = await invokeCliBytes(["capabilities", "-j"], { home });
  const commands = (JSON.parse(capabilities.out.toString()) as { data: { commands: Array<Record<string, unknown>> } }).data.commands;
  expect(commands.find(({ operation }) => operation === "run.request")).toMatchObject({
    operation: "run.request", command: ["run", "request"], output: { kind: "raw" },
    modes: ["raw"], home: "reads", mutates: false, network: "never",
  });
  const help = await invokeCliBytes(["run", "request", "--help"], { home });
  expect(help.code).toBe(0);
  expect(help.out.toString()).toMatch(/recorded byte count and SHA-256/u);
});
