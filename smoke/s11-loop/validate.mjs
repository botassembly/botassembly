#!/usr/bin/env node
// S11 — LOOP, and the last control tool (ticket 0141). ~6-8k tokens.
//
// The last container and the last control tool, and the most expensive rung on
// the ladder: three repeats of a real stage plus a tail. What it proves that
// nothing else can is that a real model can be ASKED a question between the
// checks and the seal and answer it with a tool — and that the loop ended
// because it said stop, not because the assembly's own bound ran out.
//
// The stop condition is explicit and checkable by the model ("three lines"),
// the cap is 5, and the per-repeat arithmetic is enforced by the inner stage's
// gate rather than hoped for, so `repeats` is a number this file can assert
// exactly. `ended_by: "limit"` with `repeat: 5` would be the loop failing the
// run 1/rejected (loop.md, "Running out") — the opposite outcome, and it reds
// here by name.
//
// It also re-measures disclosure note A live, for the first time since
// 2026-08-03: the repeat is knowable to the runtime and must not leak to the
// agent through a tool result or a scratch path. Offline that is
// `bot/tests/runtime-tool-disclosure.test.ts` and
// `bot/tests/runtime-scratch-opacity.test.ts`; here it is a real model's own
// session and a real scratch tree.
import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { canary, check, events, exitCode, lines, message, record, runDirectory, session, stdout, text, verdict } from "../lib.mjs";

const LOOP = "01-collect";
const INNER = "01-collect/01-add";
const TAIL = "02-report";
const REPEATS = 3;
const SCRATCH = process.env["SCRATCH"] ?? "";
const all = record(runDirectory);
const starts = events(all, "stage_start");
const ends = events(all, "stage_end");
const done = events(all, "loop_done");
const continues = events(all, "tool_call").filter((held) => held.tool === "continue");
const end = all.at(-1);
const innerStarts = starts.filter((held) => held.stage === INNER);
const innerEnds = ends.filter((held) => held.stage === INNER);
const tailStart = starts.find((held) => held.stage === TAIL);
const tailEnd = ends.find((held) => held.stage === TAIL);

check("the run exited 0", exitCode === 0, `exit ${String(exitCode)}`);
check("the record closes with run_end 0/success", end?.event === "run_end" && end.exit === 0 && end.cause === "success", JSON.stringify(end));

// ---- the container's own ending. Structural, all of it: one loop, one line.
check("the loop recorded exactly one loop_done, for the container", done.length === 1 && done[0]?.stage === LOOP, JSON.stringify(done));
check("the loop ended because the AGENT stopped it, not because the cap ran out", done[0]?.ended_by === "stop", JSON.stringify(done[0]?.ended_by));
check("the loop ran three repeats, the number the stop condition names", done[0]?.repeats === REPEATS, JSON.stringify(done[0]?.repeats));
check("the ending kept what the agent said when it stopped", typeof done[0]?.reason === "string" && done[0].reason.trim().length > 0, JSON.stringify(done[0]?.reason));

// ---- the repeats, in the record's own three-field identity (record.md).
// Which repeats ran is structural and exact; how many attempts each took is
// attempt-shaped, so the gate refusing once inside a repeat is a healthy run and
// only the SET of repeats is counted.
const numbered = innerStarts.map((held) => held.repeat);
check("the inner stage ran in repeats 1, 2 and 3 and no others", JSON.stringify([...new Set(numbered)].sort((a, b) => a - b)) === JSON.stringify([1, 2, 3]), JSON.stringify(numbered));
check("each repeat opened with a first attempt", [1, 2, 3].every((repeat) => innerStarts.some((held) => held.repeat === repeat && held.retry === 1)), JSON.stringify(innerStarts.map((held) => [held.repeat, held.retry])));
check("each repeat sealed its own output, 0/success", innerEnds.length === REPEATS && innerEnds.every((held) => held.exit === 0 && held.sealed === true), JSON.stringify(innerEnds.map((held) => [held.repeat, held.exit, held.sealed])));
check("no event of the inner stage carries a repeat outside the three", innerStarts.concat(innerEnds).every((held) => held.repeat >= 1 && held.repeat <= REPEATS), JSON.stringify(numbered));

// A session sits at the REPEAT level, because a held agent keeps its session
// across every attempt (record.md, session.md). Three repeats is three sessions
// and a fourth directory would mean a fourth repeat nothing recorded.
const innerDirectory = join(runDirectory, "stages", ...INNER.split("/"));
const repeatDirectories = existsSync(innerDirectory)
  ? readdirSync(innerDirectory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  : [];
check("the inner stage holds exactly three repeat directories", JSON.stringify(repeatDirectories) === JSON.stringify(["1", "2", "3"]), JSON.stringify(repeatDirectories));
const sessionOf = (repeat) => join(innerDirectory, String(repeat), "session.jsonl");
check("each repeat left one session of its own", [1, 2, 3].every((repeat) => existsSync(sessionOf(repeat))), JSON.stringify([1, 2, 3].map((repeat) => existsSync(sessionOf(repeat)))));

// ---- the control tool. `continue` is live only in the question round
// (gating.ts `workTools`), so every one of these is an answer to the loop's
// question and to nothing else. At least one per repeat — an unanswered question
// is a send-back and a second answer — and exactly one `stop`, in the last.
const answersIn = (repeat) => continues.filter((held) => held.repeat === repeat);
check("every repeat answered the question at least once", [1, 2, 3].every((repeat) => answersIn(repeat).length >= 1), JSON.stringify(continues.map((held) => [held.repeat, held.decision])));
check("the answers are the tool's own two words", continues.length > 0 && continues.every((held) => held.decision === "continue" || held.decision === "stop"), JSON.stringify(continues.map((held) => held.decision)));
check("each answer carries the reason the tool requires", continues.every((held) => typeof held.reason === "string" && held.reason.trim().length > 0), JSON.stringify(continues.map((held) => held.reason)));
check("repeats 1 and 2 last said continue", [1, 2].every((repeat) => answersIn(repeat).at(-1)?.decision === "continue"), JSON.stringify([1, 2].map((repeat) => answersIn(repeat).at(-1)?.decision)));
check("exactly one stop was recorded, in the repeat the loop says ended it", continues.filter((held) => held.decision === "stop").length === 1 && answersIn(REPEATS).at(-1)?.decision === "stop" && continues.find((held) => held.decision === "stop")?.repeat === done[0]?.repeats, JSON.stringify(continues.map((held) => [held.repeat, held.decision])));

// ---- what leaves the container. "The loop passes along the output of its last
// stage from its final repeat, UNDER THE LOOP'S OWN NAME" (loop.md, invariant
// 26): which stage inside wrote it is the loop's business, so the tail must see
// `collect.txt` and nothing that names `add`.
const received = (tailStart?.received ?? []).map((held) => held.name);
check("the tail stage received exactly one file", received.length === 1, JSON.stringify(received));
check("that file is named for the CONTAINER, not for the stage inside it", received[0] === "collect.txt", JSON.stringify(received));
check("nothing the tail received names the inner stage", !received.some((name) => String(name).includes("add")), JSON.stringify(received));
check("the tail stage sealed 0/success", tailEnd?.exit === 0 && tailEnd?.sealed === true, JSON.stringify(tailEnd));

// ---- and the answer itself: three lines, each the canary the request carried.
const answer = text(join(runDirectory, tailEnd?.output?.path ?? ""));
const answerLines = answer.split("\n").filter((line) => line.trim().length > 0);
check("the run's answer holds three lines", answerLines.length === REPEATS, JSON.stringify(answer));
check("every one of them is the request's canary", answerLines.length > 0 && answerLines.every((line) => line.trim() === canary), JSON.stringify(answerLines));
check("stdout is exactly the bytes the tail sealed", stdout === answer, `${String(stdout.length)} bytes of stdout, ${String(answer.length)} sealed`);

// ---- disclosure note A, re-measured live.
//
// The tree first. Directories are enumerated rather than read off file paths,
// for the reason S5's validator gives: an empty directory is still one an agent
// can `ls`. Below the run every directory is an opaque per-attempt identifier or
// one of the four slots the agent already holds (flow.ts `prepareStage`), and a
// repeat number standing anywhere in here is the leak this screen exists for —
// each repeat gets its own attempt directory, so if the repeat were in the path
// this would be the place it showed.
const OPAQUE = /^[0-9a-f]{16}$/u;
const GIVEN = new Set(["input", "tmp", "skills", "answers"]);
const directoriesUnder = (directory, held = []) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(directory, entry.name);
    held.push({ name: entry.name, segments: relative(SCRATCH, path).split(sep) });
    directoriesUnder(path, held);
  }
  return held;
};
const dirs = existsSync(SCRATCH) ? directoriesUnder(SCRATCH) : [];
const named = ["collect", "add", "report", "gather", "stages", "repeat"];
const talkative = dirs.filter(({ name }) => named.some((word) => name.toLowerCase().includes(word)));
const unaccounted = dirs.filter(({ name }) => !(OPAQUE.test(name) || GIVEN.has(name)));
check("the loop's scratch tree exists to be judged", dirs.length > 0, SCRATCH);
check("no scratch directory below the run names a stage, the loop, or a repeat", talkative.length === 0, JSON.stringify(talkative.map(({ segments }) => segments.join("/"))));
check("every scratch directory below the run is opaque or a slot the agent already holds", unaccounted.length === 0, JSON.stringify(unaccounted.map(({ segments }) => segments.join("/"))));

// Then the other channel: what the tools handed back. A tool result is the road
// note A found the repeat travelling, and the shell is the third road — `bash`
// expands the slots itself, so a path CAN appear in a result; what ticket 0067
// promises is that the path says nothing, not that it is absent. So both are
// screened: the word, and the segments of any run-scratch path that shows up.
const sessions = [1, 2, 3].filter((repeat) => existsSync(sessionOf(repeat)));
const results = sessions.flatMap((repeat) => session(sessionOf(repeat)).flatMap((entry) => {
  const held = message(entry);
  return held?.role === "toolResult" ? [JSON.stringify(held)] : [];
}));
const speaking = results.filter((held) => /\brepeats?\b|\biterations?\b/iu.test(held));
check("the loop's sessions were read, and they hold tool results to screen", sessions.length === REPEATS && results.length > 0, `${String(sessions.length)} sessions, ${String(results.length)} tool results`);
check("no tool result the model was handed says repeat", speaking.length === 0, JSON.stringify(speaking.slice(0, 2)));
const escaped = SCRATCH.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const paths = sessions.flatMap((repeat) => lines(sessionOf(repeat)).flatMap((line) => [...line.matchAll(new RegExp(`${escaped}/([\\w./-]*)`, "gu"))].map((found) => found[1] ?? "")));
const leaking = paths.filter((tail) => tail.split("/").filter((part) => part.length > 0).some((part) => !(OPAQUE.test(part) || GIVEN.has(part) || part.includes("."))));
check("every run-scratch path in the sessions is opaque the whole way down", leaking.length === 0, `${String(paths.length)} paths seen: ${JSON.stringify(leaking.slice(0, 4))}`);

verdict();
