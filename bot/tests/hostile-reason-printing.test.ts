// Ticket 0165 — a reading cannot be made to lie by what it prints.
//
// A reason is text the RUN produced: an agent's own words through a control
// tool, or the bytes a gate wrote that the machinery kept. Both reached a
// terminal exactly as written, so a reason holding `ESC[2J` cleared the
// reader's screen and one holding a carriage return repainted the line they
// had just been shown. Ian ruled (2026-08-07): escape the control character,
// keep the text — nothing is dropped, because a reading that differs from the
// record in a way the reader cannot see is the failure this prevents.
//
// The witnesses here are hostile input, not the happy path, and they go
// through the REAL CLI at BOTH places bot prints a reason: `bot show`'s
// clauses (readings.ts `said`) and a failed `bot run`'s stderr sentence
// (cli.ts). `--json` is asserted byte-identical to the file on disk over the
// same hostile record, because the record's bytes are the record's.
//
// These witnesses stay separate from show-reading.test.ts because they need
// two harnesses: one reads a crafted record with no model, and one drives a
// real failing run through a faux one.
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";
import { checkEvent, choseEvent, runEndEvent, runStartEvent, stageEndEvent, stageStartEvent, toolCallEvent, turnEvent } from "../src/record-events.ts";
import { invokeCli, invokeCliBytes, printed } from "./invoke.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const RUN = "2026-08-07T09-00-00-a3f9";
const HASH = "a".repeat(64);
const at = (second: number): string => `2026-08-07T09:00:${String(second).padStart(2, "0")}.000Z`;

// Every shape that can paint a terminal, written the way a model or a gate
// would emit it. `\r` is INTERIOR, never trailing: the stderr sentence has
// trimmed trailing whitespace since 0026, so a trailing one would be gone
// before the escaping is even asked, and would witness nothing.
const CLEARS_SCREEN = "\u001b[2Jthe screen is gone";
const REPAINTS_LINE = "harmless\rthe line was overwritten";
const KEEPS_TAB = "column\tone and column\ttwo";
const REORDERS = "\u202edesrever si enil eht\u007f";

const STORY: Record<string, unknown>[] = [
  runStartEvent({
    ts: at(0), run: RUN, assembly: "review", assemblyHash: HASH, flow: "main",
    request: { path: "request.txt", sha256: HASH, bytes: 41, via: "argument" },
  }),
  stageStartEvent({ ts: at(0), identity: { stage: "01-work", retry: 1 }, received: [], options: [] }),
  toolCallEvent({ ts: at(1), identity: { stage: "01-work", retry: 1 }, tool: "mark", decision: "skipped", item: 3,
    evidence: "fixture evidence", reason: CLEARS_SCREEN }),
  checkEvent({ ts: at(1), identity: { stage: "01-work", retry: 1 }, check: "output", exit: 0,
    capture: "stages/01-work/1/1/checks/output.txt" }),
  stageEndEvent({ ts: at(1), identity: { stage: "01-work", retry: 1 }, exit: 0, cause: "success",
    output: { path: "stages/01-work/1/1/output.txt", sha256: HASH }, sealed: true, judged: true }),
  stageStartEvent({ ts: at(1), identity: { stage: "02-pick", retry: 1 }, received: [], options: [] }),
  choseEvent({ ts: at(2), identity: { stage: "02-pick", retry: 1 }, chose: "deep", declined: ["quick"], reason: REPAINTS_LINE }),
  stageEndEvent({ ts: at(2), identity: { stage: "02-pick", retry: 1 }, exit: 0, cause: "success" }),
  stageStartEvent({ ts: at(2), identity: { stage: "03-tail", retry: 1 }, received: [], options: [] }),
  turnEvent({ ts: at(3), identity: { stage: "03-tail", retry: 1 }, provider: "fixture", model: "fixture",
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, stop: "stop" }),
  toolCallEvent({ ts: at(3), identity: { stage: "03-tail", retry: 1 }, tool: "refuse", decision: "refuse", reason: KEEPS_TAB }),
  stageEndEvent({ ts: at(3), identity: { stage: "03-tail", retry: 1 }, exit: 1, cause: "refused", reason: KEEPS_TAB }),
  runEndEvent({ ts: at(4), exit: 1, cause: "refused", reason: REORDERS }),
];

async function home(): Promise<{ home: string; file: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-hostile-reason-"));
  roots.push(root);
  const where = join(root, "home");
  const file = join(where, "runs", RUN, "record.jsonl");
  await mkdir(join(where, "runs", RUN), { recursive: true });
  await writeFile(file, `${STORY.map((event) => JSON.stringify(event)).join("\n")}\n`);
  return { home: where, file };
}

// THE FIRST WITNESS. Whole lines, not substrings: the escaped spelling is what
// a reader sees, so it is what the assertion holds.
test("bot show spells a reason's control characters and keeps every character of it", async () => {
  const where = await home();
  const shown = await invokeCli(["run", "events", RUN], { home: where.home });
  expect(shown.code, shown.err).toBe(0);
  const lines = printed(shown);

  expect(lines.filter((line) => /  (?:tool_call|chose|stage_end|run_end)  /u.test(line)).filter((line) =>
    line.includes("screen is gone") || line.includes("line was overwritten") || line.includes("column") || line.includes("desrever"))).toEqual([
    `${at(1)}  tool_call  01-work/1  mark item 3 skipped — \\x1b[2Jthe screen is gone`,
    `${at(2)}  chose  02-pick/1  deep over quick — harmless\\rthe line was overwritten`,
    `${at(3)}  tool_call  03-tail/1  refuse — column\tone and column\ttwo`,
    // A tab is ordinary text in a sentence and moves nothing the reader cannot
    // see, so it survives as itself — the one exception the rule has.
    `${at(3)}  stage_end  03-tail/1  exit 1, refused, wrote nothing — column\tone and column\ttwo`,
    `${at(4)}  run_end  -  exit 1, refused — \\u202edesrever si enil eht\\x7f`,
  ]);

  // And nothing that paints survived anywhere in what was printed: no ESC, no
  // carriage return, no DEL, no direction override, on either stream.
  const paints = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
  expect(shown.out).not.toMatch(paints);
  expect(shown.err).not.toMatch(paints);
  // Nothing was dropped either: every word of every reason is still there.
  for (const word of ["the screen is gone", "the line was overwritten", "desrever si enil eht"]) {
    expect(shown.out).toContain(word);
  }
});

// Design law 5, again (0164, and the ticket's own hard stop): `--json` is the
// record's own bytes. A machine reader is not painted by an escape, so the
// hostile record hands back byte for byte what is on disk — the escaping is
// the HUMAN mode's and reaches nothing else.
test("--json over the same hostile record is the file on disk, byte for byte", async () => {
  const where = await home();
  const raw = await readFile(where.file);
  const json = await invokeCliBytes(["run", "events", RUN, "--json"], { home: where.home });
  expect(json.code, json.err.toString()).toBe(0);
  const document = JSON.parse(json.out.toString()) as { data: { events: Record<string, unknown>[] } };
  expect(document.data.events).toEqual(raw.toString().trimEnd().split("\n").map((line): unknown => JSON.parse(line) as unknown));
  expect(json.err.length).toBe(0);
  // Not vacuous: what a machine reads back out of those bytes is the hostile
  // text itself, every character of it, and the reading's escape appears
  // nowhere in them — `--json` is the record, not a rendering of it.
  const held = document.data.events;
  expect(held.find((event) => event["event"] === "tool_call")?.["reason"]).toBe(CLEARS_SCREEN);
  expect(held.find((event) => event["event"] === "chose")?.["reason"]).toBe(REPAINTS_LINE);
  expect(held.find((event) => event["event"] === "run_end")?.["reason"]).toBe(REORDERS);
  expect(json.out.toString()).not.toContain("\\x1b");
});

const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

/** A one-stage assembly whose gate is `script` and which spends no retries, so
 *  the run ends on the gate's first word and the faux model answers once. */
async function gated(script: string): Promise<{ root: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-hostile-stderr-"));
  roots.push(root);
  const where = join(root, "home");
  const stage = join(where, "assemblies/review/flows/main/01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(where, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(where, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\nretries: 0\n---\nReview assembly.\n"),
    writeFile(join(where, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nDo the work.\n"),
    writeFile(join(stage, "gate.sh"), script),
  ]);
  await chmod(join(stage, "gate.sh"), 0o755);
  return { root, home: where };
}

// THE SECOND WITNESS. The stderr sentence a failed run prints, through the real
// `main(["run", "start", ...])` with the real gating: the gate's own bytes become the
// run's reason, and the reason cannot repaint the line it is printed on.
test("a failed run's stderr sentence spells the control characters its gate wrote", async () => {
  const held = await gated(`#!/bin/sh\nprintf '\\033[2Jcleared\\rrepainted\\tkept\\n'\nexit 1\n`);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const boundary: CliBoundary = {
    cwd: held.root,
    env: { ...process.env, BOT_HOME: held.home, PWD: held.root, XDG_CACHE_HOME: join(held.root, "cache") },
    stdinIsTTY: true, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { stdout.push(Buffer.from(bytes)); },
    stderr: (bytes) => { stderr.push(Buffer.from(bytes)); },
    clock, models,
  };
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "the answer" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);

  await expect(main(["run", "start", "review/main", "the request"], boundary)).resolves.toBe(1);
  // The cause word is bot's own and prints as it always did; everything after
  // the colon is the run's text, spelled. The tab survives; the trailing
  // newline the gate wrote is still trimmed to one (0026).
  expect(Buffer.concat(stderr).toString()).toBe("exhausted: \\x1b[2Jcleared\\rrepainted\tkept\n");
  expect(Buffer.concat(stdout).toString()).toBe("");

  // The RECORD keeps the true bytes — the escaping is the print site's alone,
  // which is what makes it safe to escape at all.
  const run = (await readdir(join(held.home, "runs")))[0] ?? "";
  const capture = await readFile(join(held.home, "runs", run, "stages/01-work/1/1/checks/gate.txt"), "utf8");
  expect(capture).toBe(`${String.fromCodePoint(0x1b)}[2Jcleared\rrepainted\tkept\n`);
  const record = (await readFile(join(held.home, "runs", run, "record.jsonl"), "utf8")).trimEnd().split("\n");
  const ended = JSON.parse(record[record.length - 1] ?? "") as Record<string, unknown>;
  expect(ended["event"]).toBe("run_end");
  expect(ended["reason"]).toBe(capture);
});
