#!/usr/bin/env node
// S9 — a real stream dies on the clock (ticket 0141). ~1-2k tokens.
//
// The only live test of aborting a real provider mid-turn. Everything else that
// knows about timeouts is offline, against a faux model whose clock the test
// owns; here a real connection is cut by `turns.ts`'s prompt guard and the
// question is what the record says afterwards.
//
// TWO STAGES, and the second one is the subject. `01-note` is an ordinary S1
// sized stage that finishes; `02-stall` carries `timeout: 1` and cannot. The
// first is there for one reason, and it is worth stating because the ticket
// asked for the opposite: THE ABORTED TURN'S SPEND IS NOT RECORDED. A prompt
// the guard abandoned is written down as `unreconciled` with its window, and
// "its spend is unknowable by construction, so nothing here enters any total"
// (record-events.ts, record.md). A rung that asserted a positive total off the
// dying stage alone would be asserting something the runtime deliberately
// refuses to claim. So the run's total is positive because a stage BEFORE the
// clock ran, which is a fact worth having anyway: the record of a run that died
// still accounts for what the run had already spent.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { canary, check, events, exitCode, lines, message, record, runDirectory, session, text, verdict } from "../lib.mjs";

const all = record(runDirectory);
const starts = events(all, "stage_start");
const ends = events(all, "stage_end");
const turns = events(all, "turn");
const end = all.at(-1);
const noteEnd = ends.find((held) => held.stage === "01-note");
const stallStarts = starts.filter((held) => held.stage === "02-stall");
const stallEnd = ends.find((held) => held.stage === "02-stall");
const stderr = text(process.env["STDERR"] ?? "");

check("the run exited 1", exitCode === 1, `exit ${String(exitCode)}`);
check("the record closes with run_end 1/timeout", end?.event === "run_end" && end.exit === 1 && end.cause === "timeout", JSON.stringify(end));
check("the stage before the clock sealed 0/success", noteEnd?.exit === 0 && noteEnd?.sealed === true, JSON.stringify(noteEnd));
check("what that stage sealed is the request's canary", text(join(runDirectory, noteEnd?.output?.path ?? "")).trim() === canary, JSON.stringify(text(join(runDirectory, noteEnd?.output?.path ?? ""))));

// Structural: a timeout is terminal, read before any check runs (gating.ts's
// `ended`), so there is no send-back and no second attempt to be had. One start,
// one end — this is not an attempt-shaped count.
check("the timed-out stage started exactly once", stallStarts.length === 1 && stallStarts[0]?.retry === 1, JSON.stringify(stallStarts.map((held) => held.retry)));
check("the timed-out stage ended 1/timeout", stallEnd?.exit === 1 && stallEnd?.cause === "timeout", JSON.stringify(stallEnd));
check("that ending is UNSEALED — nothing it wrote was judged or kept", stallEnd !== undefined && stallEnd.sealed !== true, JSON.stringify(stallEnd));
check("the record holds exactly two stage endings, the finished one and the killed one", ends.length === 2, JSON.stringify(ends.map((held) => [held.stage, held.cause])));

// The record's own arithmetic, summed here rather than scraped: the run had
// already spent tokens when the clock cut it, and a record that lost them would
// be a record claiming less than what happened.
const spent = turns.reduce((sum, held) => sum + (typeof held.total === "number" ? held.total : 0), 0);
check("the record's turn events total a positive number of tokens", spent > 0, `${String(turns.length)} turns, ${String(spent)} tokens`);

// Appending is what makes a killed run readable (record.md). `record()` above
// already refused to judge a file with an unparseable line, so reaching here at
// all is half the fact; the other half is that the LAST line is the ending —
// the file is whole, not merely parseable as far as it got.
check("the record is readable to its last line, and that line is the run's ending", end?.event === "run_end", JSON.stringify(end?.event));

// A killed run's session tail is the thing lib.mjs's `session` has always
// forgiven and nothing has ever produced on purpose. This is a SCREEN, not a
// witness: a provider that wrote nothing before the abort leaves a session with
// no torn line, and that is a healthy outcome too — so the counts go in the
// detail, where a driver reading a green ladder can still see which of the two
// happened.
const stallSession = join(runDirectory, "stages", "02-stall", "1", "session.jsonl");
const raw = existsSync(stallSession) ? lines(stallSession) : [];
const parsed = existsSync(stallSession) ? session(stallSession) : [];
check("the timed-out stage's session, if it exists, is read past a torn tail", parsed.length <= raw.length, `${String(raw.length)} lines on disk, ${String(parsed.length)} entries parsed`);

const noteSession = join(runDirectory, "stages", "01-note", "1", "session.jsonl");
check("the finished stage left a session with a user turn in it", existsSync(noteSession) && session(noteSession).some((entry) => message(entry)?.role === "user"), noteSession);

// Work the runtime abandoned and never saw settle (ticket 0028). Another screen
// rather than a witness — whether the harness settles before the terminal
// append is a race the fixture does not own — but where it fires it must name
// the stage the clock took and no other.
const abandoned = events(all, "unreconciled");
check("any unreconciled work is the timed-out stage's own", abandoned.every((held) => held.stage === "02-stall"), `${String(abandoned.length)} unreconciled: ${JSON.stringify(abandoned.map((held) => held.stage))}`);

// What the caller was told. A timeout carries no reason — `messageCause` builds
// the ending from the word alone — so cli.ts prints the cause word and nothing
// after it, and the line is exactly `timeout`.
check("stderr holds the cause line, and it is the bare word", stderr.split("\n").some((line) => line === "timeout"), JSON.stringify(stderr.slice(0, 400)));

verdict();
