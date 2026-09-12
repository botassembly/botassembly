import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, test } from "vitest";
import { currentRecord } from "./current-record.ts";

const run = promisify(execFile);
const roots: string[] = [];
const RUN = "2026-08-11T17-00-00-aaaa";
const SESSION = "stages/01-read/1/session.jsonl";

const transcript = [
  JSON.stringify({
    type: "message", timestamp: "2026-08-11T17:00:01.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "outside reader" }, { type: "toolCall", id: "call-1", name: "lookup" }] },
  }),
  JSON.stringify({
    type: "message", timestamp: "2026-08-11T17:00:02.000Z",
    message: { role: "toolResult", toolCallId: "call-1", isError: false, content: "found" },
  }),
  "",
].join("\n");

async function consumer(): Promise<{ home: string; file: string; run: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-importable-readers-"));
  roots.push(root);
  const home = join(root, "home");
  const directory = join(home, "runs", RUN);
  await mkdir(join(directory, "stages/01-read/1"), { recursive: true });
  await writeFile(join(directory, "record.jsonl"), currentRecord([
    { record: 1, event: "run_start", run: RUN, assembly: "reader", flow: "main", ts: "2026-08-11T17:00:00.000Z" },
    { event: "stage_start", stage: "01-read", retry: 1, session: SESSION, ts: "2026-08-11T17:00:01.000Z" },
    { event: "stage_end", stage: "01-read", retry: 1, exit: 0, cause: "success", ts: "2026-08-11T17:00:02.000Z" },
    { event: "run_end", exit: 0, cause: "success", ts: "2026-08-11T17:00:03.000Z" },
  ]));
  await writeFile(join(directory, SESSION), transcript);
  await mkdir(join(root, "node_modules"));
  await symlink(join(import.meta.dirname, ".."), join(root, "node_modules", "bot"), "dir");
  const file = join(root, "consumer.mjs");
  await writeFile(file, `
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as inspection from "bot/inspection";
import { inspectSession } from "bot/one-run";
import { heldRecord } from "bot/record-lines";
import { renderSession, renderSessionTools } from "bot/session";

const [home, directory, session] = process.argv.slice(2);
const transcript = await readFile(join(directory, session), "utf8");
const record = await heldRecord(directory);
const listed = await inspection.inspectRuns(home);
const rendered = await inspectSession(home, "${RUN}", "01-read", undefined, false);
if (!record?.events.some((event) => event.run === "${RUN}")) throw new Error("record reader did not read the run");
if (!renderSession(transcript).some((line) => line.includes("outside reader"))) throw new Error("session reader did not render the transcript");
if (!renderSessionTools(transcript, "01-read").some((line) => line.includes("lookup"))) throw new Error("session tool reader did not render the call");
if (!listed.output.toString().includes("${RUN}")) throw new Error("inspection reader did not list the run");
if (!rendered.output.toString().includes("outside reader")) throw new Error("one-run reader did not render the session");
if ("lockRun" in inspection || "inspectPrune" in inspection) throw new Error("the reader door exposed runtime or mutation");
`);
  return { home, file, run: directory };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("a dependent package reads a run through the public reader doors", async () => {
  const outside = await consumer();
  await run(process.execPath, [outside.file, outside.home, outside.run, SESSION], { encoding: "utf8" });
});
