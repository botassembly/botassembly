#!/usr/bin/env bash
# The smoke ladder's driver (ticket 0062, extended by 0141). Ten live-model
# rungs, in order, stopping at the first failure. Never part of `make check`.
#
#   smoke/run.sh            every rung, in order
#   smoke/run.sh 3          one rung
#
# Rung 6 costs no tokens: it inspects what the model rungs left behind, so it is
# only meaningful after them — which is why it is LAST in the order below and
# not sixth. Its number is what the falsification ledger, the handoffs and the
# README's `smoke/run.sh 6` all name, and renumbering it would have made every
# one of those sentences quietly wrong about which rung was broken on purpose.
# Ticket 0141's five new rungs are 7 through 11 and run before it, in the
# ticket's own order — cheap and isolated first (skip, refuse, timeout),
# lifecycle next, LOOP last, because the ladder stops at the first failure and a
# rung that costs 2k should be allowed to fail before one that costs 8k.
#
# Each rung runs in a child of this script under `timeout`, so no rung can
# hang a human. Runs execute from a non-repo $PWD with BOT_HOME and
# XDG_CACHE_HOME pointed at a scratch session this script creates; nothing a
# run writes ever lands in the repository.
set -u -o pipefail

# `pwd -P`, not `pwd`: physical, so a checkout reached through a convenience
# link yields the real tree (ticket 0070). cli.ts no longer cares — it resolves
# both sides of its own invoked-not-imported guard — but every path this driver
# hands to a rung should name one file rather than a spelling of it.
SMOKE_DIR=$(cd -- "$(dirname -- "$0")" && pwd -P)
REPO=$(dirname -- "$SMOKE_DIR")
CLI="$REPO/bot/src/cli.ts"
RUNG_TIMEOUT=600
MARGIN_MINUTES=15
# The one known-good pair. Every fixture's ASSEMBLY.md names it in its own
# frontmatter and the preflight below asserts they agree, so a fixture drifting
# onto another model is caught here at zero tokens rather than against spend.
PROVIDER=openai-codex
MODEL=gpt-5.6-luna

random_suffix() {
	head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

# The record's own arithmetic, read through the 0054 cost lens. The driver
# reads the CLI's machine result as data and names a malformed or missing row
# before any validator runs.
# A failed or malformed read returns nonzero. Every model rung stops before its
# validator when that happens, so a moved command contract cannot pass by
# reporting zero spend.
tokens_of() {
	local run="$1" document held
	document=$(node "$CLI" run list --fields id,tokens --limit 200 -j 2>/dev/null) || {
		echo "smoke: cannot read token totals with \`bot run list --fields id,tokens --limit 200 -j\` for ${run:-<no run>}" >&2
		return 1
	}
	held=$(SMOKE_RUN="$run" SMOKE_RUN_LIST="$document" SMOKE_FACTS="$SMOKE_DIR/s6-inspection/facts.mjs" node --input-type=module -e '
const { runList } = await import(process.env.SMOKE_FACTS);
const run = process.env.SMOKE_RUN ?? "";
const parsed = runList(process.env.SMOKE_RUN_LIST ?? "", ["id", "tokens"], run);
if (parsed.error !== undefined) {
  console.error(parsed.error);
  process.exit(1);
}
if (parsed.document?.page?.complete !== true) {
  console.error("run list is incomplete beyond the --limit 200 bound");
  process.exit(1);
}
process.stdout.write(String(parsed.rows[0].tokens));
')
	if [ -z "$held" ]; then
		echo "smoke: no exact numeric token total for ${run:-<no run>} from \`bot run list --fields id,tokens --limit 200 -j\`" >&2
		return 1
	fi
	echo "$held"
}

# Where a run's stages worked, read out of the CLI rather than composed.
#
# This reads the supported `bot run show` JSON because the command owns scratch paths.
# It used to be "$XDG_CACHE_HOME/bot/tmp/$RUN". Ticket 0140 keyed the per-run
# entry by the HOME as well as the run — two homes minting one run name shared
# one directory, and prune in either took the other's — and the key is a hash,
# so nothing outside bot can spell the path any more. That is the same move
# ticket 0067 made below the run, and it has the same answer: the supported
# reading reports the observed stage scratch path. Each names ONE attempt's
# directory; the run's own root is its parent. An empty result is said out loud,
# for the reason tokens_of gives.
scratch_of() {
	local run="$1" held error_file="$LOGS/scratch-of.err"
	held=$(node "$CLI" run show "$run" -j 2>"$error_file") || {
		echo "smoke: bot run show ${run:-<no run>} failed: $(cat "$error_file")" >&2
		return 1
	}
	if [ -s "$error_file" ]; then
		echo "smoke: bot run show ${run:-<no run>} wrote an unexpected error: $(cat "$error_file")" >&2
		return 1
	fi
	held=$(printf '%s' "$held" | SMOKE_RUN="$run" SMOKE_FACTS="$SMOKE_DIR/run-show-facts.mjs" node --input-type=module -e '
import { readFileSync } from "node:fs";
const { parseRunShow, scratchRoot } = await import(process.env.SMOKE_FACTS);
const parsed = parseRunShow(readFileSync(0, "utf8"), process.env.SMOKE_RUN);
if (parsed.error !== undefined) { console.error(parsed.error); process.exit(1); }
const root = scratchRoot(parsed);
if (typeof root !== "string") { console.error(root.error); process.exit(1); }
process.stdout.write(root);
' 2>&1) || {
		echo "smoke: cannot read scratch root from \`bot run show ${run:-<no run>} -j\`: $held" >&2
		return 1
	}
	printf '%s\n' "$held"
}

# Which run a `bot run` left behind, and the two lines a human reads. Named
# once because there are two runners below and a rung must not be able to tell
# which one produced its subject: the only difference between them is where the
# request came from, and that difference belongs in the invocation, not here.
after_run() {
	local label="$1" previous="$2"
	RUN=$(ls -1 "$BOT_HOME/runs" 2>/dev/null | tail -n 1)
	if [ -z "$RUN" ] || [ "$RUN" = "$previous" ]; then
		RUN=""
		RUN_DIR=""
	else
		RUN_DIR="$BOT_HOME/runs/$RUN"
	fi
	OUT="$LOGS/$label.out"
	echo "    $label: exit $RC, run ${RUN:-none}" >&2
	sed 's/^/      | /' "$LOGS/$label.err" >&2
}

# One `bot run start`, its exit code, its stdout, and the run it left behind.
bot_run() {
	local label="$1" target="$2" request="$3" previous
	previous=$(ls -1 "$BOT_HOME/runs" 2>/dev/null | tail -n 1)
	(cd "$WORK" && node "$CLI" run start "$target" "$request" --in "$WORK") >"$LOGS/$label.out" 2>"$LOGS/$label.err"
	RC=$?
	after_run "$label" "$previous"
}

# The same, with the request arriving on STDIN and no request argument at all —
# the third of invocation.md's three ways, and the one no rung had ever used
# (ticket 0141). The bytes go through a FILE rather than a pipe on purpose: a
# pipe makes this a pipeline, `pipefail` then reports the writer's SIGPIPE
# instead of bot's own exit where bot refuses before reading, and a rung would
# be judging exit 141. A redirected file is not a terminal either, which is the
# only thing `requestFor` asks of it.
bot_run_stdin() {
	local label="$1" target="$2" request="$3" previous
	previous=$(ls -1 "$BOT_HOME/runs" 2>/dev/null | tail -n 1)
	printf '%s\n' "$request" >"$LOGS/$label.stdin"
	(cd "$WORK" && node "$CLI" run start "$target" --in "$WORK") \
		<"$LOGS/$label.stdin" >"$LOGS/$label.out" 2>"$LOGS/$label.err"
	RC=$?
	after_run "$label" "$previous"
}

# One CLI verb a rung needs for its own sake, with its exit code kept beside its
# two streams. `bot_run` above is for runs; this is for the verbs a person types
# around one. The WRITING verbs (`bot assembly install`, `remove`) can only be
# driven from here — a validator reads, and lib.mjs's `bot` is documented as the
# read-only lens — so what they said is left in $LOGS for the validator to judge.
bot_verb() {
	local label="$1"
	shift
	(cd "$WORK" && node "$CLI" "$@") >"$LOGS/$label.out" 2>"$LOGS/$label.err"
	echo $? >"$LOGS/$label.exit"
	echo "    $label: exit $(cat "$LOGS/$label.exit")" >&2
	sed 's/^/      | /' "$LOGS/$label.err" >&2
}

rung_1() {
	CANARY="CANARY-$(random_suffix)"
	bot_run s1 "$SMOKE_DIR/s1-plumbing/assembly/plumb" "$CANARY"
	SPEND=$(tokens_of "$RUN") || return $?
	RUN_DIR="$RUN_DIR" STDOUT="$OUT" EXIT="$RC" CANARY="$CANARY" \
		node "$SMOKE_DIR/s1-plumbing/validate.mjs"
}

rung_2() {
	CANARY="CANARY-$(random_suffix)"
	bot_run s2-teach "$SMOKE_DIR/s2-taught/assembly/teach" "$CANARY"
	local taught_dir="$RUN_DIR" taught_out="$OUT" taught_rc="$RC" taught_run="$RUN"
	bot_run s2-honest "$SMOKE_DIR/s2-taught/assembly/honest" "$CANARY"
	local honest_dir="$RUN_DIR" honest_rc="$RC"
	local taught_spend honest_spend
	taught_spend=$(tokens_of "$taught_run") || return $?
	honest_spend=$(tokens_of "$RUN") || return $?
	SPEND=$(( taught_spend + honest_spend ))
	RUN_DIR="$taught_dir" STDOUT="$taught_out" EXIT="$taught_rc" CANARY="$CANARY" \
		HONEST_DIR="$honest_dir" HONEST_EXIT="$honest_rc" \
		node "$SMOKE_DIR/s2-taught/validate.mjs"
}

rung_3() {
	CANARY="CANARY-$(random_suffix)"
	bot_run s3 "$SMOKE_DIR/s3-disclosure/assembly/reveal" "$CANARY"
	SPEND=$(tokens_of "$RUN") || return $?
	RUN_DIR="$RUN_DIR" STDOUT="$OUT" EXIT="$RC" CANARY="$CANARY" \
		node "$SMOKE_DIR/s3-disclosure/validate.mjs"
}

rung_4() {
	CANARY="CANARY-$(random_suffix)"
	bot_run s4 "$SMOKE_DIR/s4-graph/assembly/pick" "Take the branch named apple. $CANARY"
	SPEND=$(tokens_of "$RUN") || return $?
	RUN_DIR="$RUN_DIR" STDOUT="$OUT" EXIT="$RC" CANARY="$CANARY" \
		node "$SMOKE_DIR/s4-graph/validate.mjs"
}

rung_5() {
	CANARY="CANARY-$(random_suffix)"
	bot_run s5 "$SMOKE_DIR/s5-works/assembly/works" "$CANARY"
	SPEND=$(tokens_of "$RUN") || return $?
	RUN_DIR="$RUN_DIR" STDOUT="$OUT" EXIT="$RC" CANARY="$CANARY" \
		SCRATCH="$(scratch_of "$RUN")" \
		node "$SMOKE_DIR/s5-works/validate.mjs"
}

# The read-only inspection verbs, against the runs every model rung already made
# (ticket 0069 item 6). No fixture, no `bot run`, no model call — it finds its
# own subject through `bot run list --limit 200 -j`, out of the $BOT_HOME every rung shares. It is
# defined here, beside its number, and RUNS LAST: see the header.
rung_6() {
	node "$SMOKE_DIR/s6-inspection/validate.mjs"
}

# ---- Ticket 0141's five. Each states its own price in its validator's header
# comment, and the numbers here are the order they run in: 7, 8, 9, 10, 11, then
# 6. Cheap and isolated first.

# Skip is a decision, not a failure (~2-3k). The `mark` tool's other resting
# state, asked of a real model by one plain sentence.
rung_7() {
	CANARY="CANARY-$(random_suffix)"
	bot_run s7 "$SMOKE_DIR/s7-skipped/assembly/skip" "$CANARY"
	SPEND=$(tokens_of "$RUN") || return $?
	RUN_DIR="$RUN_DIR" STDOUT="$OUT" EXIT="$RC" CANARY="$CANARY" \
		node "$SMOKE_DIR/s7-skipped/validate.mjs"
}

# Refusal is reachable (~2k). The token that triggers it rides the request, so
# the branch is not a judgement call; whether the model takes it is the whole
# live question, and a bluffed answer reds this rung as a finding about the pair.
rung_8() {
	CANARY="CANARY-$(random_suffix)"
	bot_run s8 "$SMOKE_DIR/s8-refused/assembly/guard" "HALT-9F2C $CANARY"
	SPEND=$(tokens_of "$RUN") || return $?
	RUN_DIR="$RUN_DIR" STDOUT="$OUT" EXIT="$RC" CANARY="$CANARY" \
		STDERR="$LOGS/s8.err" \
		node "$SMOKE_DIR/s8-refused/validate.mjs"
}

# A real stream dies on the clock (~1-2k). One stage finishes and pays for the
# rung's token total; the next carries `timeout: 1` and cannot survive its first
# round trip. The stderr capture is the rung's subject as much as the record is.
rung_9() {
	CANARY="CANARY-$(random_suffix)"
	bot_run s9 "$SMOKE_DIR/s9-clock/assembly/stall" "$CANARY"
	SPEND=$(tokens_of "$RUN") || return $?
	RUN_DIR="$RUN_DIR" STDOUT="$OUT" EXIT="$RC" CANARY="$CANARY" \
		STDERR="$LOGS/s9.err" \
		node "$SMOKE_DIR/s9-clock/validate.mjs"
}

# The tool as a user actually holds it (~1-2k). Install, list, run BY NAME with
# the request on stdin, read the answer back, remove — and the record outlives
# the assembly. The name is fixed, so a rung re-run against a session that still
# holds `lifecycle` refuses at install and says which name to remove first,
# which is the honest answer rather than a silent overwrite.
rung_10() {
	CANARY="CANARY-$(random_suffix)"
	bot_verb install assembly install "$SMOKE_DIR/s10-lifecycle/assembly" --name lifecycle
	bot_verb list assembly list
	bot_verb check-held assembly check lifecycle/answer "a request"
	bot_run_stdin s10 lifecycle/answer "$CANARY"
	SPEND=$(tokens_of "$RUN") || return $?
	bot_verb run-output run output "$RUN" --raw
	bot_verb remove assembly remove lifecycle
	RUN_DIR="$RUN_DIR" STDOUT="$OUT" EXIT="$RC" CANARY="$CANARY" LOGS="$LOGS" \
		node "$SMOKE_DIR/s10-lifecycle/validate.mjs"
}

# LOOP, and the last control tool (~6-8k). The most expensive rung there is, so
# it runs last of the model rungs: three repeats, a question answered with
# `continue` each time, and disclosure note A re-measured against a live scratch
# tree and a live session.
rung_11() {
	CANARY="CANARY-$(random_suffix)"
	bot_run s11 "$SMOKE_DIR/s11-loop/assembly/gather" "$CANARY"
	SPEND=$(tokens_of "$RUN") || return $?
	RUN_DIR="$RUN_DIR" STDOUT="$OUT" EXIT="$RC" CANARY="$CANARY" \
		SCRATCH="$(scratch_of "$RUN")" \
		node "$SMOKE_DIR/s11-loop/validate.mjs"
}

# One rung, in this process, with the session the parent built.
run_one_rung() {
	local number="$1"
	SPEND=0
	"rung_$number"
	local verdict=$?
	echo "${SPEND:-0}" >"$LOGS/s$number.tokens"
	return $verdict
}

# Everything a rung reads, derived from its session directory — named once,
# because there are two callers and a rung must not be able to tell them apart.
# The ladder derives a fresh session below; the free re-run is handed an old one
# on the command line. Ticket 0090: the exports used to sit BELOW the re-run's
# `exit`, so `SMOKE_SESSION=<wreckage> smoke/run.sh 6` — the invocation the
# handoff documents — ran with BOT_HOME unset and every verb reported on the
# operator's real bot home while the command line named the wreckage. Inside a
# ladder run it was invisible: the parent exported before re-invoking itself, so
# the child inherited what this branch never set.
session_environment() {
	SESSION="$1"
	WORK="$SESSION/work"
	LOGS="$SESSION/logs"
	export BOT_HOME="$SESSION/home"
	export XDG_CACHE_HOME="$SESSION/cache"
	# Bot's own credential file, and no pointer to it (ADR 0017): the ladder
	# authenticates out of what `bot auth import` put there, exactly as an
	# operator's machine does. XDG_CONFIG_HOME is deliberately NOT redirected
	# into the session — the credentials are the machine's, they outlive any
	# one ladder, and nothing here ever writes them.
	CREDENTIALS="${XDG_CONFIG_HOME:-$HOME/.config}/bot/credentials.json"
}

if [ -n "${SMOKE_SESSION:-}" ]; then
	session_environment "$SMOKE_SESSION"
	run_one_rung "$1"
	exit $?
fi

# The order, and rung 6 is deliberately not sixth: it inspects the wreckage of
# every model rung, so it goes after the last of them (see the header). A number
# on the command line overrides the whole list, so `smoke/run.sh 6` still means
# the inspection rung and `smoke/run.sh "7 8"` runs two.
RUNGS="${1:-1 2 3 4 5 7 8 9 10 11 6}"
SMOKE_HOME_ROOT="${SMOKE_HOME_ROOT:-${TMPDIR:-/tmp}/bot-smoke}"
SMOKE_HOME_ROOT=$(node --input-type=module -e 'import { join } from "node:path"; console.log(join(process.argv[1], "."));' "$SMOKE_HOME_ROOT") || exit 2
session_environment "$SMOKE_HOME_ROOT/$(date -u +%Y-%m-%dT%H-%M-%S)-$(random_suffix)"
mkdir -p "$BOT_HOME" "$WORK" "$XDG_CACHE_HOME" "$LOGS" || exit 2
cat > "$BOT_HOME/config.yaml" <<EOF
intelligences:
  smoke:
    provider: $PROVIDER
    model: $MODEL
    reasoning: low
EOF

# The credential file is read for one number and nothing else: `expires`, in
# milliseconds, for the provider these fixtures name. A token near expiry is a
# refusal to start rather than a rung that dies halfway through.
node --input-type=module -e '
import { readFileSync } from "node:fs";
const [path, provider, minutes] = process.argv.slice(1);
let held;
try {
  held = JSON.parse(readFileSync(path, "utf8"))[provider];
} catch (reason) {
  console.error(`smoke: cannot read ${path}: ${reason.message}`);
  process.exit(2);
}
if (held === undefined) {
  console.error(`smoke: ${path} holds no credential for ${provider}`);
  process.exit(2);
}
if (held.type !== "oauth") {
  console.log(`smoke: ${provider} credential is ${held.type}; no expiry to check`);
  process.exit(0);
}
const margin = Math.round((held.expires - Date.now()) / 60000);
if (margin < Number(minutes)) {
  console.error(`smoke: ${provider} token has ${margin} minutes of margin, under the ${minutes} required — refusing to start`);
  process.exit(2);
}
console.log(`smoke: ${provider} token has ${margin} minutes of margin`);
' "$CREDENTIALS" "$PROVIDER" "$MARGIN_MINUTES" || exit 2

# The credential above is for ONE provider, and a fixture naming a different
# provider or model would sail past that check to be found only by a rung that
# had already spent tokens — or by a ladder quietly running on a model nobody
# chose. The pair is asserted here instead, against every fixture, at zero
# spend. Frontmatter is the block between the first two `---` lines and the two
# keys are read off it by name; standard library only (ADR 0010). Finding no
# fixtures is a failure, not a clean sweep: an assertion over an empty list is
# the vacuous pass this whole tree is written against.
node --input-type=module -e '
import { readFileSync } from "node:fs";
const [provider, model, ...files] = process.argv.slice(1);
const value = (front, key) => (new RegExp(`^${key}:[ \t]*(.+?)[ \t]*$`, "mu").exec(front) ?? [])[1];
let wrong = 0;
for (const path of files) {
  let front;
  try {
    front = (/^---\r?\n([\s\S]*?)\r?\n---/u.exec(readFileSync(path, "utf8")) ?? [])[1];
  } catch (reason) {
    console.error(`smoke: cannot read ${path}: ${reason.message}`);
    wrong += 1;
    continue;
  }
  if (front === undefined) {
    console.error(`smoke: ${path} opens with no frontmatter block`);
    wrong += 1;
    continue;
  }
  const held = value(front, "intelligence");
  if (held === "smoke") continue;
  console.error(`smoke: ${path} names ${String(held)}, not the smoke intelligence mapped to ${provider}/${model}`);
  wrong += 1;
}
if (files.length === 0) {
  console.error("smoke: found no fixture ASSEMBLY.md to check — the ladder cannot say the pair agrees");
  process.exit(2);
}
if (wrong > 0) process.exit(2);
console.log(`smoke: all ${files.length} fixtures name the smoke intelligence for ${provider}/${model}`);
' "$PROVIDER" "$MODEL" "$SMOKE_DIR"/*/assembly/ASSEMBLY.md || exit 2

echo "smoke: scratch home $SESSION"
echo "smoke: BOT_HOME=$BOT_HOME  XDG_CACHE_HOME=$XDG_CACHE_HOME  PWD=$WORK"
echo "smoke: read runs with BOT_HOME=$BOT_HOME node $CLI run list --limit 200 -j"
echo

STATUS=0
LADDER_START=$SECONDS
for number in $RUNGS; do
	START=$SECONDS
	SMOKE_SESSION="$SESSION" timeout "$RUNG_TIMEOUT" "$0" "$number"
	VERDICT=$?
	ELAPSED=$((SECONDS - START))
	SPENT=$(cat "$LOGS/s$number.tokens" 2>/dev/null || echo "-")
	if [ "$VERDICT" -eq 0 ]; then
		echo "S$number  pass  ${ELAPSED}s  ${SPENT} tokens"
	else
		echo "S$number  FAIL  ${ELAPSED}s  ${SPENT} tokens  (exit $VERDICT)"
		STATUS=1
		break
	fi
	echo
done

echo
echo "smoke: ladder $([ "$STATUS" -eq 0 ] && echo passed || echo FAILED) in $((SECONDS - LADDER_START))s"
echo "smoke: wreckage under $SESSION"
exit "$STATUS"
