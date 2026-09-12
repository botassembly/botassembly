// Ticket 0101 — human readings spell terminal controls rather than obeying
// them. The transcript, record, and machine views retain their source bytes;
// only a line intended for a person is made terminal-safe.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { renderSession, renderSessionTools } from "../src/session.ts";
import { invokeCli, invokeCliBytes, printed } from "./invoke.ts";
import { currentRecord } from "./current-record.ts";

const roots: string[] = [];
const ESC = "\u001b[2J";
const PAINTS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// A transcript has several untrusted text positions. The second reading has
// its own columns, so it must protect the stage and settled-call names too.
test("session renderers spell controls in transcript text and tool names", () => {
  const source = [
    JSON.stringify({
      type: "message", timestamp: "2026-08-21T00:00:00.000Z", message: {
        role: `assistant${ESC}`,
        content: [
          { type: "text", text: `reply${ESC}text` },
          { type: "thinking", thinking: `thought${ESC}text` },
          { type: "toolCall", id: "call", name: `tool${ESC}name`, arguments: { path: `argument${ESC}text` } },
        ],
      },
    }),
    // A second, valid assistant message supplies the one settled row. The
    // hostile role above must remain a transcript line, not a pending call.
    JSON.stringify({
      type: "message", timestamp: "2026-08-21T00:00:00.000Z", message: {
        role: "assistant", content: [{ type: "toolCall", id: "call", name: `tool${ESC}name`, arguments: {} }],
      },
    }),
    JSON.stringify({
      type: "message", timestamp: "2026-08-21T00:00:01.000Z", message: {
        role: "toolResult", toolCallId: "call", toolName: `result${ESC}name`, isError: false, content: [],
      },
    }),
  ].join("\n");

  const transcript = renderSession(source);
  const tools = renderSessionTools(source, `stage${ESC}name`);
  for (const line of [...transcript, ...tools]) expect(line).not.toMatch(PAINTS);
  expect(transcript.join("\n")).toContain("reply\\x1b[2Jtext");
  expect(transcript.join("\n")).toContain("tool\\x1b[2Jname");
  expect(tools).toEqual(["stage\\x1b[2Jname  tool\\x1b[2Jname  ok  1000ms"]);
});

// The record has names in both the listing and the event reading. Its JSON is
// a machine interface and the session's raw mode is an exact-byte interface,
// so neither may inherit the human renderer's escaping.
test("human run readings spell hostile names without changing record or raw session bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-human-rendering-"));
  roots.push(root);
  const home = join(root, "home");
  const run = `2026-08-21T00-00-00${ESC}run`;
  const assembly = `review${ESC}assembly`;
  const stage = `01-work${ESC}stage`;
  const session = `stages/${stage}/1/session.jsonl`;
  const events = [
    { record: 1, ts: "2026-08-21T00:00:00.000Z", event: "run_start", run, assembly, assemblyHash: "a".repeat(64), flow: "main" },
    { ts: "2026-08-21T00:00:01.000Z", event: "stage_start", stage, retry: 1, session },
  ];
  const record = Buffer.from(currentRecord(events));
  const transcript = Buffer.from(`${JSON.stringify({ type: "message", timestamp: "2026-08-21T00:00:01.000Z", message: { role: "assistant", content: `reply${ESC}text` } })}\n`);
  await mkdir(join(home, "runs", run, "stages", stage, "1"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "runs", run, "record.jsonl"), record),
    writeFile(join(home, "runs", run, session), transcript),
  ]);

  const runs = await invokeCli(["run", "list"], { home });
  const shown = await invokeCli(["run", "events", run], { home });
  for (const line of [...printed(runs), ...printed(shown)]) expect(line).not.toMatch(PAINTS);
  expect(runs.out).toContain("review\\\\x1b[2Jassembly");
  expect(shown.out).toContain("01-work\\x1b[2Jstage");

  const machine = await invokeCliBytes(["run", "events", run, "--json"], { home });
  const raw = await invokeCliBytes(["run", "session", run, stage, "--raw"], { home });
  expect((JSON.parse(machine.out.toString()) as { data: { events: unknown[] } }).data.events)
    .toEqual(record.toString().trimEnd().split("\n").map((line): unknown => JSON.parse(line) as unknown));
  expect(raw.out).toEqual(transcript);
});
