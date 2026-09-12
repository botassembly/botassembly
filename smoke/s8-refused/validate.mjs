#!/usr/bin/env node
// S8 — refusal is reachable (ticket 0141). ~2k tokens.
//
// Every `1/refused` witness in `bot/tests` is faux: a scripted model that calls
// the tool because the test told it to. Whether a real low-reasoning model
// reaches for `refuse` when an explicit sentence tells it to — instead of
// bluffing an answer, which is the failure mode that matters — is purely a live
// question, and this is the only place it is asked.
//
// IF THE MODEL BLUFFS, THIS RUNG REDS AND THAT IS THE FINDING. The stage's
// instruction is one sentence with a literal token in it and a named tool; a
// model that writes an answer anyway has told us something true about the pair,
// and the answer is a ticket, never a loosened validator. Do not soften this
// file to make a bluff pass — the README's rule and this comment are the same
// rule.
//
// The forced half is deterministic: the token rides the request, so the branch
// is not a judgement call. `refuse` is live in every work round (turns.ts's
// `workTools`), so nothing about the stage's shape has to be arranged for it.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { bot, check, events, exitCode, record, runDirectory, runName, stdout, text, verdict } from "../lib.mjs";

const TOKEN = "HALT-9F2C";
const all = record(runDirectory);
const ends = events(all, "stage_end");
const end = all.at(-1);
const start = all[0];
const stageEnd = ends.at(-1);
const refusals = events(all, "tool_call").filter((held) => held.tool === "refuse");
const stderr = text(process.env["STDERR"] ?? "");

check("the run exited 1", exitCode === 1, `exit ${String(exitCode)}`);
check("the request that reached the run carried the forbidden token", text(join(runDirectory, "request.txt")).includes(TOKEN) && start?.event === "run_start", JSON.stringify(start?.request));
check("the record closes with run_end 1/refused", end?.event === "run_end" && end.exit === 1 && end.cause === "refused", JSON.stringify(end));

// Structural: one stage, one ending. A refusal is terminal — it is read before
// the checks run at all (gating.ts `work`), so there is no send-back to make a
// second attempt out of.
check("exactly one stage ended, 1/refused", ends.length === 1 && stageEnd?.exit === 1 && stageEnd?.cause === "refused", JSON.stringify(ends.map((held) => [held.stage, held.exit, held.cause])));
check("the stage's ending carries the agent's reason", typeof stageEnd?.reason === "string" && stageEnd.reason.trim().length > 0, JSON.stringify(stageEnd?.reason));

// NOTHING SEALED, said over the whole record rather than over one event: the
// claim is that this run has no answer anywhere, which is what `bot run output`
// below is then asked to agree with.
check("no stage sealed an output anywhere in the run", !all.some((held) => held.sealed === true), JSON.stringify(all.filter((held) => held.sealed === true)));
check("stdout is empty: a run that did not end 0 prints no answer", stdout === "", JSON.stringify(stdout.slice(0, 200)));

// The tool's own recorded decision. `refuse` takes only a reason, so the
// decision word is fixed at "refuse" by pi-tap.ts's `controlDecision` — what is
// live here is that the call happened at all, exactly once, with a reason.
check("exactly one refuse call is recorded", refusals.length === 1, JSON.stringify(refusals));
check("that call is the refuse tool's own decision, with a reason", refusals[0]?.decision === "refuse" && typeof refusals[0]?.reason === "string" && refusals[0].reason.trim().length > 0, JSON.stringify(refusals[0]));

// What the caller was told, on the stream diagnostics go to (runtime.md). The
// line is `<cause>: <reason>` (cli.ts), so the cause word is the line's start
// and the reason is the agent's, printed once and never parsed by anything.
check("stderr names the cause in its own line", stderr.split("\n").some((line) => line.startsWith("refused: ")), JSON.stringify(stderr.slice(0, 400)));

// The capture the runtime writes for a refusal (gating.ts `refused`) — found
// through the ending's own identity rather than composed from the stage's name
// out of the fixture, so a stage that ran somewhere else is not silently missed.
const attempt = ["stages", ...String(stageEnd?.stage ?? "").split("/"), String(stageEnd?.repeat ?? 1), String(stageEnd?.retry ?? 1)];
const capture = join(runDirectory, ...attempt, "checks", "refusal.txt");
check("the refusal's own capture is beside the attempt that refused", existsSync(capture) && text(capture).trim().length > 0, capture);

// And the reading verb's other half, asked of a live record for the first time:
// a run answers only when it finished and succeeded (one-run.ts `unanswered`).
const answered = bot("run", "output", runName, "--raw");
check("bot run output --raw refuses this run and prints nothing", answered.code === 1 && answered.out === "", `exit ${String(answered.code)}, stdout ${JSON.stringify(answered.out)}`);
check("the refusal says which nothing it is, naming the ending", /has no output/u.test(answered.err) && answered.err.includes("1/refused"), JSON.stringify(answered.err));

verdict();
