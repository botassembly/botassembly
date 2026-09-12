#!/usr/bin/env node
// S5 — the works. Fan-out delivery, a delegation round-trip through a real
// child run, a skill inside that child, and the scope isolation invariant 38
// promises across the subflow boundary — all judged from artifacts.
import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { bot, check, events, exitCode, lines, record, runDirectory, runName, text, verdict } from "../lib.mjs";
import { parseRunShow } from "../run-show-facts.mjs";

const ALPHA = "TOKEN-ALPHA-7K3";
const BETA = "TOKEN-BETA-4M8";
const all = record(runDirectory);
const ends = events(all, "stage_end");
const fan = events(all, "parallel_done")[0];
const call = events(all, "subflow_call")[0];
const joinEnd = ends.find((held) => held.stage === "02-join");
const branch = (name) => fan?.branches?.find((held) => held.branch === name);

check("the run exited 0", exitCode === 0, `exit ${String(exitCode)}`);
check("the parallel recorded both branches as run", branch("alpha")?.started === true && branch("beta")?.started === true, JSON.stringify(fan?.branches));
check("both branches exited 0", branch("alpha")?.exit === 0 && branch("beta")?.exit === 0, JSON.stringify(fan?.branches));
check("alpha sealed its own token", text(join(runDirectory, ends.find((held) => held.stage === "01-fan/alpha")?.output?.path ?? "")).includes(ALPHA));
check("beta sealed its own token", text(join(runDirectory, ends.find((held) => held.stage === "01-fan/beta")?.output?.path ?? "")).includes(BETA));

check("exactly one subflow call was made", events(all, "subflow_call").length === 1, `${String(events(all, "subflow_call").length)} calls`);
check("the call named the oracle and started", call?.flow === "oracle" && call?.started === true, JSON.stringify(call));
check("the child ended 0/success", call?.exit === 0 && call?.cause === "success", JSON.stringify(call));
check("the call was made from the join stage", call?.stage === "02-join", JSON.stringify(call?.stage));

const childDirectory = join(runDirectory, ...String(call?.child ?? "").split("/"));
const child = existsSync(join(childDirectory, "record.jsonl")) ? record(childDirectory) : [];
check("the child run is nested under the join stage's attempt", /^stages\/02-join\/1\/\d+\/subflows\/1$/u.test(String(call?.child)), JSON.stringify(call?.child));
check("the child has a record of its own", child.length > 0, childDirectory);
check("the child's record closes 0/success", child.at(-1)?.event === "run_end" && child.at(-1)?.exit === 0, JSON.stringify(child.at(-1)));

const childEnd = events(child, "stage_end").at(-1);
const childOutput = text(join(childDirectory, childEnd?.output?.path ?? ""));
check("the child's sealed output holds DELTA", childOutput.includes("DELTA"), JSON.stringify(childOutput));

// Ticket 0067 redesigned this tree: below `<scratch>/<run>/` every directory is
// an opaque per-attempt identifier, so the path this used to spell —
// `stages/02-join/1/subflows/<n>/output.txt` — no longer exists, and nothing can
// compose it from the stage's name. The FACT is unchanged and still asserted:
// the call's answer landed at `$SUBFLOWS/<n>/output.<ext>`, holding DELTA.
//
// Ticket 0069 item 2 changed how it is found. It used to be WALKED to — "exactly
// one file in the whole tree ends `/<call>/output.txt`" — which is a fact about
// S5's shape and not about the format: `counter` is created per stage attempt
// (flow.ts:100), so a second calling stage, a retry of the join or a nested
// subflow puts a second one under the same root and turns a healthy run red.
// Now it is RESOLVED. The base cannot be composed (that is the whole of 0067),
// so it is read from the supported one-run reading. Uniqueness is not lost:
// "exactly one subflow call was made" is asserted above from the record, and the
// answer is now pinned to THAT call's own directory rather than to the tree
// happening to hold one of them.
const SCRATCH = process.env["SCRATCH"] ?? "";
const shown = bot("run", "show", runName, "-j");
const shownFacts = parseRunShow(shown.out, runName);
check("bot run show reads the run as the supported JSON shape", shown.code === 0 && shown.err === "" && shownFacts.error === undefined, shownFacts.error ?? `exit ${String(shown.code)} ${shown.err}`);
if (shownFacts.error !== undefined) verdict();
const callerIdentity = call?.repeat === undefined ? String(call?.stage ?? "") : `${String(call?.stage ?? "")}#${String(call.repeat)}`;
const shownCall = shownFacts.data.subflows.find((row) => row.caller === callerIdentity
	&& row.attempt === (call?.retry ?? 1) && row.call === call?.call && row.subflow === call?.flow
	&& row.started === call?.started && row.child === (call?.child ?? null)
	&& row.exit === (call?.exit ?? null) && row.cause === (call?.cause ?? null));
const shownStage = shownFacts.data.stages.find((row) => row.identity === shownCall?.caller && row.attempt === shownCall?.attempt);
const joinScratch = shownStage?.scratch ?? "";
check("bot run show matches the calling subflow and stage", shownCall !== undefined && shownStage !== undefined, JSON.stringify({ call: shownCall, stage: shownStage }));
check("bot run show names the scratch directory of the calling stage", joinScratch !== "" && existsSync(joinScratch), joinScratch === "" ? `no scratch for ${String(call?.stage)}` : joinScratch);
const answerDirectory = joinScratch === "" ? "" : join(joinScratch, "answers", String(call?.call ?? ""));
const sealedAnswers = answerDirectory !== "" && existsSync(answerDirectory)
  ? readdirSync(answerDirectory).filter((name) => name.startsWith("output.")) : [];
check("the call's answer is the one sealed file under $SUBFLOWS/<call>", sealedAnswers.length === 1, `${answerDirectory}: [${sealedAnswers.join(" ")}]`);
check("the answer landed under $SUBFLOWS holding DELTA", text(join(answerDirectory, sealedAnswers[0] ?? "")).includes("DELTA"), join(answerDirectory, sealedAnswers[0] ?? ""));
check("that directory is inside the run's own scratch root", answerDirectory !== "" && !relative(SCRATCH, answerDirectory).startsWith(".."), `${SCRATCH} vs ${answerDirectory}`);

// And the redesign itself, judged from the same artifacts: no directory below
// the run's scratch root names a stage, a repeat or the layout it replaced.
// Directories are enumerated directly rather than read off the file paths: a
// directory holding no files is still a directory an agent can `ls`, and the
// live tree has three of them (`tmp`, and `skills`/`answers` when unused).
const directoriesUnder = (directory, held = []) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(directory, entry.name);
    held.push({ name: entry.name, segments: relative(SCRATCH, path).split(sep) });
    directoriesUnder(path, held);
  }
  return held;
};

// Ticket 0069 item 3. The screen used to be a DENYLIST of the seven words 0067
// replaced, so a new talkative directory nobody thought to list walked straight
// through. The honest shape is an allowlist — the same argument
// `bot/tests/runtime-scratch-opacity.test.ts` makes in the gate: below the run,
// every directory is a content-free identifier or one of a small fixed set.
// A STRENGTHENING, not redesign-tracking: nothing that failed before passes now,
// and the denylist below is kept as well, in the ticket's own words, so a future
// vocabulary that somehow satisfied the shape still goes red.
const OPAQUE = /^[0-9a-f]{16}$/u;
// The names that survive are slots the agent already holds — `$INPUT`, `$TMP`,
// `$SKILLS`, and the folder `$SUBFLOWS` points at (flow.ts's prepareStage).
const GIVEN = new Set(["input", "tmp", "skills", "answers"]);
// A bare number STANDING UNDER `answers` is the call index, which subflow.md
// fixes as part of the slot's contract. The parent is half the name's meaning,
// and it is what keeps 0063 item 19's flake out of here: an attempt hash whose
// sixteen hex characters are all decimal digits (about 1 in 1,845) is taken by
// the OPAQUE branch, and it never stands under `answers`. This screen therefore
// never has to tell a hash from an index by digits alone.
const callIndex = ({ name, segments }) => /^[1-9][0-9]*$/u.test(name) && segments.at(-2) === "answers";
// A materialized skill brings its OWN directory names with it — flow.ts copies
// `$SKILLS/<name>` out of the assembly, recursively — and the live tree really
// has one (`<attempt>/skills/passphrase`, the oracle's). Those names are not the
// graph: the skill is announced to the agent by name in its own prompt, so it
// discloses nothing invariant 6 protects. The carve-out is narrow on purpose:
// `skills` counts only where every directory above it is an opaque attempt
// identifier, which is the only place prepareStage ever puts one.
const insideSkills = ({ segments }) => {
  const index = segments.indexOf("skills");
  return index >= 0 && index < segments.length - 1 && segments.slice(0, index).every((held) => OPAQUE.test(held));
};
const named = ["stages", "subflows", "fan", "join", "alpha", "beta", "oracle"];
const dirs = existsSync(SCRATCH) ? directoriesUnder(SCRATCH) : [];
const talkative = dirs.filter(({ name }) => named.some((word) => name.toLowerCase().includes(word)));
const unaccounted = dirs.filter((held) => !(OPAQUE.test(held.name) || GIVEN.has(held.name) || callIndex(held) || insideSkills(held)));
check("no scratch directory below the run names the graph", dirs.length > 0 && talkative.length === 0, `${String(dirs.length)} directories, talkative: ${talkative.map(({ name }) => name).join(" ")}`);
check("every scratch directory below the run is an opaque identifier or a slot the agent already holds", dirs.length > 0 && unaccounted.length === 0, `${String(dirs.length)} directories, unaccounted: ${unaccounted.map(({ segments }) => segments.join("/")).join(" ")}`);

const joined = text(join(runDirectory, joinEnd?.output?.path ?? ""));
check("the join sealed both branch tokens and DELTA", joined.includes(ALPHA) && joined.includes(BETA) && joined.includes("DELTA"), JSON.stringify(joined));

// Invariant 38: no session crosses the boundary. The child's own sessions are
// where a leak would show, so every one of them is read.
const sessions = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(join(directory, entry.name));
    else if (entry.name === "session.jsonl") sessions.push(join(directory, entry.name));
  }
};
if (existsSync(childDirectory)) walk(childDirectory);
const leaked = sessions.flatMap((path) => lines(path)).filter((line) => line.includes(ALPHA) || line.includes(BETA));
check("the child wrote at least one session", sessions.length > 0);
check("no parent branch token appears in any child session", leaked.length === 0, `${String(leaked.length)} lines`);

verdict();
