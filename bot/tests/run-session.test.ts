import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import { CLI_CONTRACTS } from "../src/cli-contract.ts";
import { currentRecord } from "./current-record.ts";
import { invokeCli, invokeCliBytes } from "./invoke.ts";

const roots: string[] = [];
const RUN = "2026-09-11T21-00-00-session";
const STAGE = "01-work";

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

function direct(text: string): string {
  return JSON.stringify({ type: "message", timestamp: "2026-09-11T21:00:00.000Z", message: { role: "user", content: [{ type: "text", text }] } });
}

function transaction(text: string): string {
  return JSON.stringify([{ kind: "entry", seq: 1, timestamp: 1, id: "entry-1", parentId: null, type: "message", message: { role: "assistant", content: [{ type: "text", text }] } }]);
}

async function fixture(lines = [direct("old format"), transaction("new format")]): Promise<{ home: string; session: string }> {
  const home = await mkdtemp(join(tmpdir(), "bot-run-session-"));
  roots.push(home);
  const session = join(home, "runs", RUN, `stages/${STAGE}/1/session.jsonl`);
  await mkdir(join(session, ".."), { recursive: true });
  await writeFile(session, `${lines.join("\n")}\n`);
  await writeFile(join(home, "runs", RUN, "record.jsonl"), currentRecord([
    { record: 1, event: "run_start", run: RUN, assembly: "demo", flow: "main", ts: "2026-09-11T21:00:00.000Z" },
    { event: "stage_start", stage: STAGE, retry: 1, session: `stages/${STAGE}/1/session.jsonl`, ts: "2026-09-11T21:00:00.000Z" },
  ]));
  return { home, session };
}

test("run session publishes and dispatches the retained reader", async () => {
  const where = await fixture();
  expect(CLI_CONTRACTS.find((held) => held.operation === "run.session")).toMatchObject({
    command: ["run", "session"], output: { kind: "raw" }, modes: ["markdown", "raw"],
    home: "reads", mutates: false, network: "never",
  });
  expect(CLI_CONTRACTS.find((held) => held.operation === "run.session")?.options).toEqual([
    { name: "--after", aliases: [], type: "string", repeatable: false, bytes: 8_192 },
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--limit", aliases: [], type: "integer", repeatable: false, default: 100, minimum: 1, maximum: 500 },
    { name: "--raw", aliases: [], type: "boolean", repeatable: false },
    { name: "--repeat", aliases: [], type: "integer", repeatable: false, minimum: 1 },
  ]);
  expect(CLI_CONTRACTS.find((held) => held.operation === "run.session")?.limits).toEqual({
    cursorDecodedBytes: 6_144, cursorEncodedBytes: 8_192, humanErrorBytes: 2_048, pageDefault: 100,
    pageMaximum: 500, rawInputBytes: 1_048_576, rawPhysicalLines: 10_000, renderedStdoutBytes: 1_048_576,
    sourceLineBytes: 1_048_576, sourcePassBytes: 4_194_304, sourcePhysicalLines: 1_000_000,
  });
  const current = await invokeCli(["run", "session", RUN, STAGE], { home: where.home });
  const legacy = await invokeCli(["run", "session", RUN, STAGE], { home: where.home });
  expect(current).toEqual(legacy);
  expect(current.out).toContain("old format");
  expect(current.out).toContain("new format");
});

test("run session preserves exact raw bytes", async () => {
  const where = await fixture();
  const current = await invokeCliBytes(["run", "session", RUN, STAGE, "--raw"], { home: where.home });
  const legacy = await invokeCliBytes(["run", "session", RUN, STAGE, "--raw"], { home: where.home });
  expect(current).toEqual(legacy);
});

test("run session rejects malformed requests before home access", async () => {
  const oversized = "a".repeat(8_193);
  for (const args of [
    ["run", "session", RUN],
    ["run", "session", RUN, STAGE, "--repeat", "0"],
    ["run", "session", RUN, STAGE, "--limit", "501"],
    ["run", "session", RUN, STAGE, "--raw", "--limit", "1"],
    ["run", "session", RUN, STAGE, "--after", oversized],
    ["run", "session", RUN, STAGE, "--home", "/a", "--home", "/b"],
    ["run", "session", RUN, STAGE, "--unknown"],
  ]) {
    const held = await invokeCli(args, { home: "/definitely/absent" });
    expect(held.code, args.join(" ")).toBe(2);
    expect(held.out, args.join(" ")).toBe("");
  }
});

test("run session maps stale cursor conflicts to exit 3", async () => {
  const where = await fixture([direct("one"), direct("two")]);
  const first = await invokeCli(["run", "session", RUN, STAGE, "--limit", "1"], { home: where.home });
  const after = /--after (?<cursor>\S+)\./u.exec(first.err)?.groups?.["cursor"];
  if (after === undefined) throw new Error("Expected a cursor.");
  const parts = Buffer.from(after, "base64url").toString().split("\0");
  parts[0] = "1";
  parts.splice(8, 1);
  const versionOne = Buffer.from(parts.join("\0")).toString("base64url");
  const continued = await invokeCli(["run", "session", RUN, STAGE, "--after", versionOne], { home: where.home });
  expect(continued.code, continued.err).toBe(0);
  expect(continued.out).toContain("two");
  await writeFile(where.session, `${direct("changed")}\n`);
  const stale = await invokeCli(["run", "session", RUN, STAGE, "--after", after], { home: where.home });
  expect(stale.code).toBe(3);
  expect(stale.out).toBe("");
});

test("run session converts a synchronous output failure into exit 4", async () => {
  const where = await fixture(), errors: Buffer[] = [];
  const clock: CliBoundary["clock"] = {
    milliseconds: () => 0, timestamp: () => "2026-09-11T21:00:00.000Z",
    setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
  };
  const code = await main(["run", "session", RUN, STAGE], {
    cwd: "/", env: { BOT_HOME: where.home }, stdinIsTTY: true, stderrIsTTY: false, clock,
    readStdin: () => Promise.resolve(Buffer.alloc(0)), stdout: () => { throw Object.assign(new Error("closed"), { code: "EIO" }); },
    stderr: (bytes) => { errors.push(Buffer.from(bytes)); },
  });
  expect(code).toBe(4);
  expect(Buffer.concat(errors).toString()).toContain("could not write");
});
