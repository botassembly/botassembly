#!/usr/bin/env node
// S7 — skip is a decision, not a failure (ticket 0141). ~2-3k tokens.
//
// The first rung that tests the `mark` tool's DECISION dimension rather than
// mere completion. S2 already proves a checklist can be finished; this proves
// the other resting state exists and is honoured: item 2 asks for a second
// token the request does not have, the stage says in one plain sentence to mark
// that item skipped, and the checklist check must pass anyway — a skipped item
// is an ADDRESSED item (checklist.md, "`skipped` does not block"), which is
// invariant 9's model of the tool.
//
// The doctrine this rung is written under: the only thing asked of the model is
// one explicit sentence a low-reasoning model can follow. Nothing here is
// forced by hoping the model errs; the checklist itself is the deterministic
// component, because an item left `todo` blocks the exit whatever the prose
// says. If the model marks item 2 `done` instead — claiming a token that is not
// there — this rung reds by name, and that is a FINDING about the pair rather
// than a fixture bug.
import { canary, check, events, exitCode, record, runDirectory, stdout, text, verdict } from "../lib.mjs";
import { join } from "node:path";

const all = record(runDirectory);
const starts = events(all, "stage_start");
const ends = events(all, "stage_end");
const checks = events(all, "check");
const marks = events(all, "tool_call").filter((held) => held.tool === "mark");
const end = all.at(-1);
const sealed = ends.at(-1);

// The LAST mark for an item is that item's decision: "marking the same item
// twice replaces the first mark, and every mark is recorded" (checklist.md), so
// a run where the model marked, thought again and re-marked is a healthy run and
// the record holds both lines. Reading the last one is reading the decision;
// counting the lines would be reading the model's second thoughts.
const decisions = new Map();
for (const held of marks) decisions.set(held.item, held);

check("the run exited 0", exitCode === 0, `exit ${String(exitCode)}`);
check("the record closes with run_end 0/success", end?.event === "run_end" && end.exit === 0 && end.cause === "success", JSON.stringify(end));
// Attempt-shaped, so "at least": an unmarked item is a send-back and a second
// attempt, and a run that recovered from one is still a run that ended right.
check("the stage started at least once, as 01-list attempt 1", starts.length >= 1 && starts[0]?.stage === "01-list" && starts[0]?.retry === 1, JSON.stringify(starts.map((held) => [held.stage, held.retry])));
check("exactly one stage ended, and it sealed 0/success", ends.length === 1 && sealed?.exit === 0 && sealed?.cause === "success" && sealed?.sealed === true, JSON.stringify(ends.map((held) => [held.stage, held.exit, held.cause, held.sealed])));

// Structural: the checklist has three items, so three items were settled.
check("all three checklist items were settled", decisions.size === 3 && [1, 2, 3].every((number) => decisions.has(number)), JSON.stringify([...decisions.keys()]));
check("every mark is one of the tool's two resting states", marks.length > 0 && marks.every((held) => held.decision === "done" || held.decision === "skipped"), JSON.stringify(marks.map((held) => [held.item, held.decision])));
check("item 2 was SKIPPED, which is the decision this rung exists for", decisions.get(2)?.decision === "skipped", JSON.stringify(decisions.get(2)));
check("the skip carries the reason the tool requires of it", typeof decisions.get(2)?.reason === "string" && decisions.get(2).reason.trim().length > 0, JSON.stringify(decisions.get(2)?.reason));
check("items 1 and 3 were done", decisions.get(1)?.decision === "done" && decisions.get(3)?.decision === "done", JSON.stringify([decisions.get(1)?.decision, decisions.get(3)?.decision]));

// The point of the rung: a skipped item does not block. The check ran and said
// yes with one item never done, so the exit was earned by an ADDRESSED list and
// not by a finished one.
const checklist = checks.filter((held) => held.check === "checklist");
check("the checklist check ran", checklist.length >= 1, `${String(checklist.length)} checklist checks`);
check("the checklist check passed with an item skipped", checklist.at(-1)?.exit === 0, JSON.stringify(checklist.at(-1)));
check("the checklist's last word came before the stage's", checklist.length > 0 && all.indexOf(checklist.at(-1)) < all.indexOf(sealed));

// And the ordinary work still happened, judged the way S1 judges it: equality,
// not containment, so an essay with the token inside it is not a pass.
const output = text(join(runDirectory, sealed?.output?.path ?? ""));
check("the sealed output is the request's canary and nothing else", output.trim() === canary, JSON.stringify(output));
check("stdout is exactly the bytes the stage sealed", stdout === output, `${String(stdout.length)} bytes of stdout, ${String(output.length)} sealed`);

verdict();
