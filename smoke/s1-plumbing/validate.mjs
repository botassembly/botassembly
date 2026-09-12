#!/usr/bin/env node
// S1 — plumbing. Auth, provider, the agent loop, the record, the session, and
// stdout-is-the-answer. The canary rides the request, so nothing but this run
// could have produced it.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { canary, check, events, exitCode, message, record, runDirectory, session, stdout, text, verdict } from "../lib.mjs";

const all = record(runDirectory);
const start = all[0];
const end = all.at(-1);
const stageStarts = events(all, "stage_start");
const stageEnds = events(all, "stage_end");
const sessionPath = join(runDirectory, "stages", "01-echo", "1", "session.jsonl");

// Equality, not containment. `includes` rewarded chatter: this stage's whole
// instruction is "write that token and nothing else", and a model that wrote an
// essay with the token somewhere inside it passed clean — S1 has no gate, so
// nothing else was looking. Trimmed, because a trailing newline is a file
// ending, not prose. The verdict is now the instruction's own words.
check("the run exited 0", exitCode === 0, `exit ${String(exitCode)}`);
check("stdout is the request's canary and nothing else", stdout.trim() === canary, `stdout was ${JSON.stringify(stdout)}`);
check("the record opens with run_start naming the flow", start?.event === "run_start" && start.flow === "plumb", JSON.stringify(start?.event));
check("the record closes with run_end 0/success", end?.event === "run_end" && end.exit === 0 && end.cause === "success", JSON.stringify(end));
check("one stage started, and it is 01-echo attempt 1", stageStarts.length === 1 && stageStarts[0]?.stage === "01-echo" && stageStarts[0]?.retry === 1, JSON.stringify(stageStarts.map((held) => held.stage)));
check("one stage ended, sealed, 0/success", stageEnds.length === 1 && stageEnds[0]?.exit === 0 && stageEnds[0]?.cause === "success" && stageEnds[0]?.sealed === true, JSON.stringify(stageEnds[0]));
check("stage_start precedes stage_end", all.indexOf(stageStarts[0]) < all.indexOf(stageEnds[0]));
// The same equality on the source of those bytes. stdout and the seal are one
// file by construction — `bot run` prints the sealed output it just read
// (run.ts, cli.ts) — so this holds the stronger end of that identity: the seal
// is what a later `bot run output --raw` would hand back, long after the stdout is gone.
const sealed = text(join(runDirectory, stageEnds[0]?.output?.path ?? ""));
check("the sealed output is the canary and nothing else", sealed.trim() === canary, JSON.stringify(sealed));
check("stdout is exactly the bytes the stage sealed", stdout === sealed, `${String(stdout.length)} bytes of stdout, ${String(sealed.length)} sealed`);
check("the stage's session.jsonl exists", existsSync(sessionPath));

const entries = existsSync(sessionPath) ? session(sessionPath) : [];
const users = entries.filter((entry) => message(entry)?.role === "user");
check("the session holds exactly one user turn", users.length === 1, `${String(users.length)} user turns`);

verdict();
