// Ticket 0017 F4 — the CLI exit path. After a complete run the process
// sometimes never exited: a lingering provider handle (pi-ai keep-alive
// socket, no public close) held the event loop while cli.ts trusted drain.
// exitFlushed exits explicitly, but only after both stdio streams confirm
// their flush — proven here by piping megabytes through a child process that
// carries a deliberately lingering handle and still seeing every byte AND a
// prompt exit. A bare process.exit() fails the byte count (65,536 of 8 MiB in
// the scripted reproduction).
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { exitFlushed } from "../src/cli.ts";
import { BOUNDARY_MS, cliPath, piped } from "./boundary.ts";
import { currentRecord } from "./current-record.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
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

test("exitFlushed is the exported exit seam", () => {
  expect(typeof exitFlushed).toBe("function");
});
