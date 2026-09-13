#!/usr/bin/env node
// S6 — the CLI meets a live run. Ticket 0069 item 6.
//
// Rungs 1-5 assert what the RUNTIME did. This one asserts what the TOOLS say
// about it. Before it, the ladder ran `bot run start` and the supported machine
// readings. They carry the bounded facts directly.
//
// It needs no fixture and makes no model call — it reads the runs the rungs
// above already made, out of the same $BOT_HOME. That is the point, and it is
// why this rung is cheap. Run on its own (`smoke/run.sh 6`) there is nothing to
// inspect and it goes red by name, which is the honest answer.
//
// Every command here is read-only.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { bot, botElsewhere, check, columns, verdict } from "../lib.mjs";
import { recordLines, runList } from "./facts.mjs";
import { parseRunShow } from "../run-show-facts.mjs";

// The home every verb below reads. lib.mjs refused to judge at all unless this
// is set and is the session's own, so by here it is a directory that exists.
const home = process.env["BOT_HOME"] ?? "";

const S5_ASSEMBLY = fileURLToPath(new URL("../s5-works/assembly", import.meta.url));
// The subject is found by the TAIL of the recorded assembly path — anchored on a
// separator, so `/elsewhere/notsmoke/s5-works/assembly` cannot match it — rather
// than by the whole of it (ticket 0094).
//
// lib.mjs:62-71 resolves the CLI from its own file so that "a rung asserts the
// tree it is standing in, never whatever `bot` happens to be installed", and
// that property is untouched here: the verbs below still run THIS checkout's
// cli.ts and no other. But it is a statement about which CODE is exercised, and
// finding the subject is a different job. A record's `assembly` is a fact about
// the past — it names the tree that RAN, not the tree that is now READING — and
// this rung exists to read wreckage some earlier process left behind. Requiring
// the two to be the same string is what made every worktree unable to re-run any
// session the main checkout made, and made the deliberate break invisible from
// one: 26 assertions cascaded off an unfound subject whether or not anything was
// broken. Note that S5_ASSEMBLY still names this tree absolutely where that is
// what is actually being asserted — `bot assembly check` below reads the fixture on disk
// HERE — so the property is not weakened, it is spent on the use that holds it.
//
// The looseness this admits: another checkout's s5 run, in this same session
// home, would match. That costs nothing available to pay. run.sh mints a fresh
// session per ladder, so two checkouts share one only if an operator points them
// both at one $SMOKE_SESSION by hand, and the two would then be spellings of the
// same fixture. Absoluteness never bought the safety it looked like it bought
// either: wreckage this checkout made at an older commit matches the absolute
// path exactly while the fixture on disk has since moved on, so a stale subject
// was always accepted. It guarded location, which nothing here attacks, and
// never staleness, which is the risk that is real.
const S5_TAIL = S5_ASSEMBLY.split(sep).slice(-3).join(sep);
const underS5 = (recorded) => recorded.endsWith(`${sep}${S5_TAIL}`);
// S2's assembly is found the same way, for the one thing only a FAILED run can
// show: what `bot run output` says when there is no answer. S2 runs two flows out of
// this single assembly, so unlike S5 the path does not name the run on its own —
// the flow column finishes the job below.
const S2_TAIL = fileURLToPath(new URL("../s2-taught/assembly", import.meta.url)).split(sep).slice(-3).join(sep);
const underS2 = (recorded) => recorded.endsWith(`${sep}${S2_TAIL}`);
const nonEmpty = (text) => text.split("\n").filter((line) => line.length > 0);

// ---- bot run list: the listing, and the run identity this rung works from. The
// identity comes out of the verb under test rather than from a file the ladder
// passed itself: the rungs run their fixtures by explicit path, so run_start's
// assembly IS the fixture directory, and that is what names S5's run.
const runs = bot("run", "list", "--limit", "200", "-j");
check("bot run list exits 0 and returns JSON", runs.code === 0 && runs.out.trim() !== "", `exit ${String(runs.code)} ${runs.err}`);
check("bot run list writes nothing to stderr", runs.err === "", JSON.stringify(runs.err));
const parsedRuns = runList(runs.out, ["id", "assembly", "flow", "startedAt", "endedAt", "duration", "state", "exit", "cause", "tokens"]);
check("bot run list returns the exact complete run document and rows", parsedRuns.rows !== undefined && parsedRuns.rows.length > 0 && parsedRuns.document?.page?.complete === true, parsedRuns.error ?? JSON.stringify(parsedRuns.document?.page));
if (parsedRuns.rows === undefined) verdict();
const listed = parsedRuns.rows;

// Every assertion below reports on this one run, so an unfound subject is ONE
// named failure and the verdict — the same judgement lib.mjs's `record` makes
// about an absent record, for the same reason: nothing after it could be judged,
// so there is nothing to soften. Before ticket 0094 it cascaded into 26, which
// is not a louder way of saying the same thing but a quieter one — that number
// is what a broken session and a merely unreadable one both produced, so the
// rung's own deliberate break proved nothing from a worktree.
const s5 = listed.find((held) => underS5(held.assembly ?? ""));
if (!check("bot run list names S5's run by the assembly it actually ran", s5 !== undefined, `no listed assembly ends in ${S5_TAIL}: ${JSON.stringify(listed.map((held) => held.assembly))}`)) verdict();
const run = s5?.id ?? "";
check("that line names the flow S5 ran", s5?.flow === "works", JSON.stringify(s5?.flow));
check("that line names the status S5 ended with", s5?.state === "ended" && s5?.exit === 0 && s5?.cause === "success", JSON.stringify([s5?.state, s5?.exit, s5?.cause]));
check("that line's token total is a positive number", Number.isSafeInteger(s5?.tokens) && s5.tokens > 0, JSON.stringify(s5?.tokens));
check("every listed run has the ended state", listed.every((held) => held.state === "ended"), JSON.stringify(listed.map((held) => [held.id, held.state])));

// ---- the same question, asked through the FLAG. Every rung reaches its home
// through $BOT_HOME, so `--home` — the one spelling the CLI shares across the
// current readings — had never been parsed by a live
// invocation; it was covered offline and nowhere else. Here the variable is
// taken out of the child's environment and the flag put in its place, and the
// two answers must be the same listing, byte for byte. Both halves are needed:
// without unsetting the variable a `--home` that did nothing at all would still
// agree, and without comparing the answers an unset variable would quietly send
// the verb to the operator's own bot home and still exit 0.
const flagged = botElsewhere(home, "run", "list", "--limit", "200", "-j");
check("bot run list --home DIR, with BOT_HOME unset, returns exactly what BOT_HOME did", flagged.code === 0 && flagged.out === runs.out, `exit ${String(flagged.code)} ${flagged.err}`);

// ---- bot run show: bounded stage, subflow, and scratch facts.
const shown = bot("run", "show", run, "-j");
const shownFacts = parseRunShow(shown.out, run);
check("bot run show returns the selected run's exact supported JSON shape", shown.code === 0 && shown.err === "" && shownFacts.error === undefined, shownFacts.error ?? `exit ${String(shown.code)} ${shown.err}`);
if (shownFacts.error !== undefined) verdict();
const recordCall = recordLines(bot("run", "record", run, "--raw").out).events?.find((event) => event.event === "subflow_call");
check("bot run show names S5's selected run", shownFacts.data.run === run, JSON.stringify(shownFacts.data.run));
check("bot run show names S5's successful ending", shownFacts.data.state === "ended" && shownFacts.data.exit === 0 && shownFacts.data.cause === "success", JSON.stringify([shownFacts.data.state, shownFacts.data.exit, shownFacts.data.cause]));
// Counted as "at least", never "exactly": a gate refusing once is a healthy run
// and puts a second stage row for the same stage in the record. The three
// authored stages themselves are fixed.
const STAGES = ["01-fan/alpha", "01-fan/beta", "02-join"];
const stageRows = shownFacts.data.stages;
const starts = stageRows.map((row) => `${row.identity}/${String(row.attempt)}`);
check("bot run show names S5's three stages, each on a first attempt", STAGES.every((name) => stageRows.some((row) => row.identity === name && row.attempt === 1)), JSON.stringify(starts));
check("bot run show names no stage S5 does not have", stageRows.length >= 3 && stageRows.every((row) => STAGES.includes(row.stage)), JSON.stringify(stageRows.map((row) => row.identity)));
const shownCalls = shownFacts.data.subflows;
check("bot run show names the join's one subflow call", shownCalls.length === 1 && recordCall !== undefined && shownCalls[0].caller === recordCall.stage && shownCalls[0].attempt === recordCall.retry && shownCalls[0].call === recordCall.call && shownCalls[0].subflow === recordCall.flow && shownCalls[0].started === recordCall.started && shownCalls[0].child === (recordCall.child ?? null) && shownCalls[0].exit === (recordCall.exit ?? null) && shownCalls[0].cause === (recordCall.cause ?? null), JSON.stringify(shownCalls));
const scratch = [...new Set(stageRows.filter((row) => STAGES.includes(row.stage) && row.scratch !== null).map((row) => row.scratch))];
check("bot run show names three distinct stage scratch paths", scratch.length === 3, JSON.stringify(scratch));
check("every scratch directory bot run show names is really there", scratch.length > 0 && scratch.every((path) => existsSync(path)), JSON.stringify(scratch));

// The driver reads token totals through the same narrow machine result. The
// selected row has exactly two keys and the numeric value cannot be a display
// abbreviation.
const tokenResult = bot("run", "list", "--fields", "id,tokens", "--limit", "200", "-j");
const parsedTokens = runList(tokenResult.out, ["id", "tokens"], run);
const tokenRow = parsedTokens.rows?.find((row) => row.id === run);
check("bot run list exposes S5's exact numeric token total from a complete page", tokenResult.code === 0 && parsedTokens.document?.page?.complete === true && tokenRow !== undefined && Number.isSafeInteger(tokenRow.tokens) && tokenRow.tokens > 0 && tokenRow.tokens === s5?.tokens, parsedTokens.error ?? JSON.stringify(parsedTokens.document?.page ?? tokenRow));

// ---- bot run record --raw: the record's own bytes, which names the subjects
// below. S6 passes those names back to the CLI readers. It never opens a path
// taken from the raw record itself.
const stage = (starts.find((held) => held.startsWith("02-join")) ?? "").replace(/\/\d+$/u, "");
const record = bot("run", "record", run, "--raw");
const parsedRecord = recordLines(record.out.toString());
check("bot run record --raw returns a complete JSONL record", record.code === 0 && parsedRecord.events !== undefined, parsedRecord.error ?? `exit ${String(record.code)}`);
if (parsedRecord.events === undefined) verdict();
const shownJson = parsedRecord.events;

// ---- bot run output: the verb whose whole job is giving back what a run answered.
// It arrived in ticket 0134, long after this rung (0069), and had never met a
// live record. The answer is
// the LAST output a stage SEALED, so for S5 that is the join's. S6 compares the
// command's bytes against the hash the record sealed. This is the ladder asking
// a finished run what it said.
const sealOf = (named) => shownJson.filter((event) => event.event === "stage_end" && event.sealed === true && (named === undefined || event.stage === named)).at(-1);
const answerSeal = sealOf(undefined)?.output;
check("the record names a sealed output and its sha256", typeof answerSeal?.path === "string" && answerSeal.path !== "" && typeof answerSeal.sha256 === "string" && answerSeal.sha256 !== "", JSON.stringify(answerSeal));
const answered = bot("run", "output", run, "--raw");
const answeredHash = answered.code === 0 ? createHash("sha256").update(answered.out).digest("hex") : "";
check("bot run output --raw hands back bytes matching the record's sealed hash", answered.code === 0 && answeredHash === answerSeal?.sha256, `exit ${String(answered.code)}, ${String(answered.out.length)} bytes, hash ${answeredHash}`);

// The two assertions are a pair, and each pins a different fidelity: the one
// above pins the VERB's fidelity to the RECORD's hash. The runtime validates the
// record-controlled output path before reading it, so S6 does not open that path
// itself. That keeps a symlink in a stage path inside the run from redirecting
// this validator to outside bytes. The command-level symlink proof runs in the
// Bot test suite.

// The stage form reaches INSIDE the run, so it is asked for a stage whose seal
// is not the run's answer — a fan branch, whose sealed bytes are a different
// file from the join's. Asking for the join would have passed even if the stage
// argument were ignored entirely.
const BRANCH = "01-fan/alpha";
const branchSeal = sealOf(BRANCH)?.output;
const branch = bot("run", "output", run, BRANCH, "--raw");
const branchHash = branch.code === 0 ? createHash("sha256").update(branch.out).digest("hex") : "";
check("the record names the branch's sealed output and its sha256", typeof branchSeal?.path === "string" && branchSeal.path !== "" && typeof branchSeal.sha256 === "string" && branchSeal.sha256 !== "", JSON.stringify(branchSeal));
check("bot run output --raw reaches a named stage's own seal by its recorded hash", branch.code === 0 && branchHash === branchSeal?.sha256, `exit ${String(branch.code)}, ${String(branch.out.length)} bytes, hash ${branchHash}`);
check("that stage's seal really is different bytes from the run's answer", branchSeal?.path !== answerSeal?.path && branch.out !== answered.out, `${branchSeal?.path} vs ${answerSeal?.path}`);

// And the refusal, which is the contract's other half: a run answers only when
// it finished and succeeded, so S2's honest run — which the gate refused until
// its retries ran out — has a record, has stages, and has no answer. Found the
// way S5's run is found, by the tail of the assembly path the record itself
// wrote, except that S2's two flows share one assembly, so the flow column is
// what tells the honest run from the taught one.
const honest = listed.find((held) => underS2(held.assembly ?? "") && held.flow === "honest");
if (check("bot run list names S2's honest run by its assembly and its flow", honest !== undefined, JSON.stringify(listed.map((held) => [held.assembly, held.flow])))) {
  const name = honest?.id ?? "";
  check("that run ended 1/exhausted, as S2 asserted on the day", honest?.state === "ended" && honest?.exit === 1 && honest?.cause === "exhausted", JSON.stringify([honest?.state, honest?.exit, honest?.cause]));
  const refused = bot("run", "output", name, "--raw");
  check("bot run output --raw refuses a run that did not end 0, printing no answer", refused.code === 1 && refused.out === "", `exit ${String(refused.code)}, stdout ${JSON.stringify(refused.out)}`);
  check("the refusal says which nothing it is, on stderr", /has no output/u.test(refused.err), JSON.stringify(refused.err));
}

const pointed = shownJson.find((held) => held.event === "stage_start" && held.stage === stage)?.session ?? "";
check("the record names a session file for that stage", pointed !== "", pointed === "" ? "no stage_start with a session path" : pointed);
const raw = bot("run", "session", "--raw", run, stage);
check("bot run session --raw reads the record-named session", raw.code === 0 && pointed !== "" && raw.out !== "", `${String(raw.code)} exit, ${String(raw.out.length)} bytes from the verb`);

const rendered = bot("run", "session", run, stage);
check("bot run session renders that stage", rendered.code === 0 && rendered.out.trim() !== "", `exit ${String(rendered.code)} ${rendered.err}`);
const renderedLines = nonEmpty(rendered.out);
// These two read the transcript's content, so they depend on the join having
// made its call on the attempt the record names first — which is what the stage
// instructs, and what a gate refusal about the OUTPUT would not change.
// An assistant turn renders as its content blocks joined with " | " (session.ts),
// and a reasoning model puts a thinking block first, so the call is a block of
// that line rather than its start — the first live run of this rung reddened
// here on a transcript that did contain the call.
check("the rendered session shows the assistant calling the subflow tool", renderedLines.some((line) => columns(line)[1] === "assistant" && (columns(line)[2] ?? "").split(" | ").some((part) => part.startsWith("call subflow"))), JSON.stringify(renderedLines.slice(0, 8)));
check("the rendered session shows the oracle's answer coming back", renderedLines.some((line) => (columns(line)[1] ?? "").startsWith("tool:subflow:") && line.includes("DELTA")), JSON.stringify(renderedLines.filter((line) => (columns(line)[1] ?? "").startsWith("tool:subflow:"))));
check("bot run session refuses a stage the run never ran", bot("run", "session", run, "99-nothing").code === 1);


// ---- bot assembly check: the plan the CLI reports for the fixture a real run consumed,
// against the stages that run actually walked. Offline this verb only ever met
// assemblies the tests wrote themselves.
const planned = bot("assembly", "check", `${S5_ASSEMBLY}/works`, "a request");
check("bot assembly check accepts the assembly S5 just ran", planned.code === 0 && planned.err === "", `exit ${String(planned.code)} ${planned.err}`);
const stages = nonEmpty(planned.out).map(columns).filter((row) => row[1] === "STAGE").map((row) => row[0] ?? "");
check("bot assembly check names exactly the stages the run walked", stages.length === 3 && stages.every((name) => starts.includes(`${name}/1`)), `${JSON.stringify(stages)} vs ${JSON.stringify(starts)}`);


verdict();
