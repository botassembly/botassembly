#!/usr/bin/env node
// S4 — control graph and hooks. A real chooser takes a named branch, the
// branch not taken leaves no trace anywhere, and a before hook's rewrite is
// visible in what the run finally sealed.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { check, events, exitCode, record, runDirectory, stdout, text, verdict } from "../lib.mjs";

const MARKER = "PRIMED-MARKER-9F2C";
const all = record(runDirectory);
const ends = events(all, "stage_end");
const hooks = events(all, "hook");
const chose = events(all, "chose")[0];
const appleEnd = ends.find((held) => held.stage === "02-decide/apple");
const reportEnd = ends.find((held) => held.stage === "03-report");
const before = hooks.find((hook) => hook.hook === "before");
const success = hooks.find((hook) => hook.hook === "success");

check("the run exited 0", exitCode === 0, `exit ${String(exitCode)}`);
check("the chooser chose apple", chose?.chose === "apple", JSON.stringify(chose));
check("the chooser declined exactly banana", JSON.stringify(chose?.declined) === '["banana"]', JSON.stringify(chose?.declined));
check("the chooser recorded a reason", typeof chose?.reason === "string" && chose.reason.length > 0, JSON.stringify(chose?.reason));
check("no banana event exists in the record", !all.some((held) => typeof held.stage === "string" && held.stage.includes("banana")), JSON.stringify(all.filter((held) => typeof held.stage === "string" && held.stage.includes("banana"))));
check("no banana directory exists in the run", !existsSync(join(runDirectory, "stages", "02-decide", "banana")));

check("the before hook ran on 01-prepare and exited 0", before?.exit === 0 && before?.stage === "01-prepare", JSON.stringify(before));
check("the success hook ran on the chosen stage and exited 0", success?.exit === 0 && success?.stage === "02-decide/apple", JSON.stringify(success));

const appleOutput = text(join(runDirectory, appleEnd?.output?.path ?? ""));
const captured = text(join(runDirectory, success?.capture ?? ""));
check("the chosen stage sealed its output", appleEnd?.sealed === true && appleEnd?.exit === 0, JSON.stringify(appleEnd));
check("the success capture is byte-for-byte the sealed output", captured === appleOutput && appleOutput.length > 0, `${JSON.stringify(captured)} vs ${JSON.stringify(appleOutput)}`);

const report = text(join(runDirectory, reportEnd?.output?.path ?? ""));
check("the run's final output names the branch that ran", report.includes("apple"), JSON.stringify(report));
check("the before hook's marker survived into the final output", report.includes(MARKER), JSON.stringify(report));
check("stdout is that same answer", stdout.includes(MARKER) && stdout.includes("apple"), JSON.stringify(stdout));

verdict();
