#!/usr/bin/env node
// S2 — checks earn the exit, and the gate teaches. The teach flow proves the
// send-back loop carries a gate's words to a real model and the model acts on
// them; the honest flow proves a stage that cannot pass fails out loud.
import { join } from "node:path";
import { canary, check, events, exitCode, record, runDirectory, text, verdict } from "../lib.mjs";

const all = record(runDirectory);
const starts = events(all, "stage_start");
const checks = events(all, "check");
const marks = events(all, "tool_call").filter((held) => held.tool === "mark");
const ends = events(all, "stage_end");
const gates = checks.filter((held) => held.check === "gate");
const sealed = ends.at(-1);

check("the teach run exited 0", exitCode === 0, `exit ${String(exitCode)}`);
check("the stage ran exactly two attempts", starts.length === 2 && starts[0]?.retry === 1 && starts[1]?.retry === 2, `${String(starts.length)} attempts`);
check("both checklist items were marked", new Set(marks.map((held) => held.item)).size === 2 && marks.every((held) => held.decision === "done" || held.decision === "skipped"), JSON.stringify(marks.map((held) => [held.item, held.decision])));
check("the checklist check passed", checks.some((held) => held.check === "checklist" && held.exit === 0));
check("the schema was validated and passed", checks.some((held) => held.check === "schema" && held.exit === 0));
check("the gate ran twice", gates.length === 2, `${String(gates.length)} gate checks`);
check("the gate refused attempt 1", gates[0]?.exit === 1 && gates[0]?.retry === 1, JSON.stringify(gates[0]));
check("the gate passed attempt 2", gates[1]?.exit === 0 && gates[1]?.retry === 2, JSON.stringify(gates[1]));

const taught = text(join(runDirectory, gates[0]?.capture ?? ""));
check("the attempt-1 capture holds the gate's teaching text", taught.includes('The value of "word" must end with -TAUGHT.'), JSON.stringify(taught));

// A sealed output that is not JSON is a named failure, never a SyntaxError out
// of the validator itself — ticket 0069 item 4's class of defect, found beside
// it. The schema check should have caught it first, so this going red while the
// schema assertion above stayed green is itself the finding.
const output = sealed?.output?.path === undefined ? "{}" : text(join(runDirectory, sealed.output.path));
let parsed;
try {
  parsed = JSON.parse(output);
} catch {
  parsed = undefined;
}
check("the sealed output parses as JSON", parsed !== undefined, JSON.stringify(output.slice(0, 200)));
const held = parsed ?? {};
check("the sealed output is 0/success", sealed?.exit === 0 && sealed?.cause === "success" && sealed?.sealed === true);
check("the final word still carries the request's canary", typeof held.word === "string" && held.word.startsWith(canary), JSON.stringify(held));
check("the final word ends -TAUGHT", typeof held.word === "string" && held.word.endsWith("-TAUGHT"), JSON.stringify(held));
check("the final checked is boolean true", held.checked === true, JSON.stringify(held));

const honestDirectory = process.env["HONEST_DIR"] ?? "";
const honest = record(honestDirectory);
const honestEnd = honest.at(-1);
const hooks = events(honest, "hook");
const failure = hooks.find((hook) => hook.hook === "failure");
const captured = text(join(honestDirectory, failure?.capture ?? ""));

check("the honest run exited 1", Number(process.env["HONEST_EXIT"] ?? "-1") === 1, process.env["HONEST_EXIT"]);
check("the honest run ended 1/exhausted", honestEnd?.event === "run_end" && honestEnd.exit === 1 && honestEnd.cause === "exhausted", JSON.stringify(honestEnd));
check("the honest stage got one attempt, its retries being 0", events(honest, "stage_start").length === 1);
check("the honest gate refused", events(honest, "check").some((held) => held.check === "gate" && held.exit === 1));
check("the failure hook fired", failure !== undefined && failure.exit === 0, JSON.stringify(hooks.map((hook) => hook.hook)));
check("the failure hook saw $CAUSE as exhausted", captured.includes("cause=exhausted"), JSON.stringify(captured));
check("the failure hook could read $REASON", captured.includes("reason-readable=yes"), JSON.stringify(captured));

verdict();
