# ADR 0008 — The record event vocabulary

**Status:** accepted (Ian, 2026-07-31) · **Date:** 2026-07-31

## Decision

The record is JSONL: one object per line, appended as it happens, never
rewritten. Keys are written in a fixed order so the file is filterable with
`grep` before anything parses it.

### Shared first fields

Every line starts with `ts`, then `event`, then the identity where one applies:

- `ts` — RFC 3339 UTC with millisecond precision (`2026-07-31T15:58:19.125Z`).
- `event` — one of the closed set below. Nothing else is a record line.
- `stage` — the stage's path from the flow root, leading numbers kept.
- `repeat` — LOOP counter, ≥ 1; present iff the stage sits inside a `LOOP`
  (placement, knowable before the run).
- `retry` — attempt counter, ≥ 1, **always present** on stage-scoped lines.
  Attempts are always counted (the earlier "iff configured" rule was vacuous —
  `retries` always resolves to something).

Field presence follows spec invariant 46: configuration never decides it, and
a field is absent only when the thing it names never existed — no output, no
`output` field; a branch that never started, no `exit`. Nothing is ever left
out by choice.

Three fields, never a composite string. Identity is stamped by explicit
per-harness tap context, never ambient module state — under the one-process
model, interleaved PARALLEL branches and subflow children share the event
loop, and ambient state cross-stamps (ADR 0014).

### The initial accepted event set (historical)

This table records the initial set accepted with this ADR. The current vocabulary lives in `specification/elements/record.md`. The maintained schema ledger lives in `sdlc/planning/bot-contraction/record-event-schema.md`. The constructor registry in `bot/src/record-events.ts` and its writer oracle in `bot/tests/record-event-shape.test.ts` enforce the current implementation. Later accepted work may add events without rewriting this historical table.

| event | payload fields |
| --- | --- |
| `run_start` | `record` (format version, `1`; always the first line — spec invariant 48), `run`, `assembly`, `assembly_hash`, `flow`, `request{path,sha256,bytes,via}` (the bytes live in the run's request file — a request is bytes, maybe binary, and JSON text cannot carry it; the record points, never embeds), `options[{name,value,rung}]` |
| `run_end` | `exit`, `cause` |
| `stage_start` | `received[{name,path,sha256}]` (empty on held re-attempts), `session` (path to the stage-repeat's session.jsonl — the reference ADR 0006 promises; the same path on every attempt, because a held agent keeps its session) |
| `stage_end` | `exit`, `cause`, `output{path,sha256}` with `sealed` (bool) and `judged` (bool) beside it — all three present iff an output exists, because the two booleans describe the output (P6 interpretation, blessed): sealed on success, kept-unsealed on `signal` (runtime.md's interrupted-stage rule) — `reason` on refused/rejected/fault |
| `turn` | `provider`, `model`, `input`, `output`, `cache_read`, `cache_write`, `total`, `stop` |
| `check` | `check` (`output`\|`checklist`\|`schema`\|`gate`\|`select`\|`question`), `file` (which executable ran — the gate in a `gate/` folder is named here; the non-executable checks have none), `exit`, `capture` (path under the attempt's `checks/` — `output-missing.txt` for the `output` check), `sha256` of the executed file's bytes at that moment. `select` is the CHOOSE agent's stop-gate (stopped without selecting, or named a non-alternative); `question` is the LOOP tail's answer round; both capture the feedback the agent was re-prompted with, so Q5 — what was it told — is answerable for every held round (P6 gap 3) |
| `tool_call` | `tool` (`mark`\|`refuse`\|`continue`\|`select`), `decision`, `reason`, `item` for mark |
| `subflow_call` | one per call in a batch: `call`, `flow`, `input{text\|path,sha256,bytes}`, `exit`, `cause`, `reason?`, `child` (path to the child run dir), `depth`, `started` |
| `chose` | `chose` (absent when the chooser failed — nothing was chosen, and a field whose referent never existed is absent, invariant 46), `declined[]`, `reason`, `via` (`body`\|`executable`); for `executable`: `exit`, `capture`, `sha256` (invariant 14's per-execution hash — a chooser is executed machinery like a gate) |
| `loop_done` | `repeats`, `ended_by` (`stop`\|`limit`\|`refused`\|`exhausted`\|`rejected`\|`blocked`\|`timeout`\|`fault`), `reason?` — `limit` on a loop with a body accompanies cause `rejected` (the agent was still asking to continue); on a bodiless loop it accompanies `success`, because a loop with no question cannot run out (loop.md). A failed body keeps its exact cause. An outside signal uses its own record sequence and writes no conflicting `loop_done`. |
| `parallel_done` | `width`, `concurrent` (how many actually ran at once — parallel.md requires it), `branches[{branch,started,exit?,cause?}]` — a never-started branch is `started:false` with no exit and no cause, because nothing is claimed for what never ran; recorded order never implies run order |
| `hook` | `hook` (`before`\|`success`\|`failure`), `exit`, `capture`, `sha256` |
| `hash_drift` | `file`, `expected`, `actual` — followed by `run_end` exit 2 |
| `signal` | `signal`, `name` |

All paths are relative to the run's directory. All hashes are SHA-256.

**Superseded statement (2026-09-06):** Manual Bot ticket 0045 supersedes the `chose.via` vocabulary in the historical table and the executable chooser described below. The current choice contract has one agent chooser. New `chose` events record the selection, declined alternatives, and reason without an origin field. Readers treat a retained `via` value as an unknown additive field.

**Container conventions** (P6's interpretation, blessed): an agent chooser is
a stage in the record — `stage_start` with `session`, rounds, `stage_end` —
per choose.md ("the chooser is the choose folder itself, with a `retry`
counter"). An executable chooser gets `stage_start` without `session` (no
agent, no session — absent referent) and its `chose`/`stage_end`. A `LOOP` or
`PARALLEL` container writes no `stage_start`/`stage_end` of its own — its
`loop_done`/`parallel_done` plus the run/stage events of its contents are the
whole story; a container produces no output to start or end a stage around.

### The Pi/runtime split

**Pi feeds facts about model work**, read from one observational tap on the
harness event stream:

- `turn` maps from `turn_end.message`: `provider`, `model`, `stopReason` →
  `stop`, and `usage.{input,output,cacheRead,cacheWrite,totalTokens}`.
- `tool_call` maps from `tool_execution_start.{toolName,args}` and
  `tool_execution_end.result.details` (the refuse reason, the mark item…).
- `subflow_call` maps its arguments from `tool_execution_start(subflow)
  .args.calls[]` and its per-call outcome/timing from
  `tool_execution_end.result.details[]`.

**The runtime writes facts about everything else**: run/stage boundaries,
identity, received/produced files and their hashes, checks and their captures,
hooks, container decisions, causes, exit codes, hash drift, signals. None of
these appear in the Pi stream, and nothing the record needs is missing from it
(verified against every P1/P2 dump).

Pi events carry no stage identity; the tap stamps `stage`/`repeat`/`retry`
from the per-harness closure it was constructed with (ADR 0014 — never
ambient state). Two ordering/accounting facts the implementation
must respect: Pi delivers a terminating tool's `tool_execution_end` before
that turn's `turn_end`, so `stage_end` is written at `agent_end`, never at the
tool call; and a provider may report zero usage for an aborted turn, so a
timed-out run's token total is a floor.

Causes derive from Pi's stop condition plus the runtime's own knowledge:
`stop` → the checks decide (`success`/`exhausted`) — except the LOOP tail
stage, where the question round decides after the checks (ADR 0007);
`toolUse` on `refuse` → `refused`; `aborted` → `timeout` when the runtime's
clock fired, `signal` when the outside did; `error` → `fault`, with the
surfaced message as `reason`. Three causes never come from Pi at all:
`rejected` (a hook or `choose` executable ran cleanly and said no; a loop hit
`repeat` still being asked to continue), `fault`-for-assembly-executables
(could not execute, broke a passed output, named a missing alternative), and
`timeout`-for-machinery — a gate's, hook's, or chooser's own clock ran out
(record.md's `timeout`/exit-2 row). A killed executable has no exit code: its
`check`/`hook`/`chose` line writes `exit: null`, the capture holds whatever it
printed before the kill, and the stage ends exit 2, cause `timeout`. All three
are runtime knowledge, per the spec's cause table. A chooser or LOOP-question
round that spends the last retry without an answer ends `exhausted`, exit 1 —
the same word spent checks get.

## Acceptance test

The seven questions of `specification/elements/record.md` § "What a record
answers", executed as the seven scripts in
`planning/prototypes/p3-record-shape/queries/` (`q1-asked.sh` …
`q7-called.sh`) against real record files. A vocabulary change that breaks any
of them is wrong; the queries are the conformance fixtures, and they must
answer from the run directory alone — the record plus the capture/output files
it points at, nothing else. The queries ran unchanged against nested child-run
records, which is the composability check.

## Validation, honestly split

**P6 grounding (2026-07-31, adversarially audited):** everything below that
was "paper design" is now generated for real — `chose` both ways,
`loop_done` all endings, `parallel_done` under genuine interleaving with
failure semantics, `hook`, `hash_drift`, `signal`, mark/continue/select, the
clock-fired `timeout` (cause derived from the runtime's clock actually
firing, counterfactually checked by the audit), the hung gate's
`exit: null`, and the Pi-fed/runtime-stamped cross-check passing on all 19
records. P3's seven queries ran unchanged against all of them. The three
vocabulary gaps P6 hit are folded in above (`chose` absent on failure,
`ended_by: exhausted`, `check: select|question`). Still unproven: subflow
records regenerated in the revised shape, and the audit's two
carry-forwards — one unexplained cold-start flake in 18 harness runs
(timing-margin assertions), and the prototypes tree being untracked in git,
so "queries unchanged" rests on mtime evidence; the fixtures should be
committed. Known fixture defect to fix when the queries move into `bot/`:
q3 groups by stage and prints only the first entry, under-reporting held
re-attempts; and a question-round retry moves the attempt counter past the
checks-passed output, so a reader (and the runtime) must track which
attempt's output passed — P6's `passedOutput` mechanism is the shape of the
fix.

**Dump-grounded (P3, real P1/P2 events):** `run_start`/`run_end`/
`stage_start`/`stage_end`/`turn`/`check`(gate)/`tool_call`(refuse)/
`subflow_call`, and questions Q1 (request), Q4 (causes from stopReason — with
one exception below), Q6 (usage sums reproduce from the record's own `turn`
lines; no independent cross-check against the dumps was run), Q7 (calls). No
Pi gaps found — nothing a question needed is missing from Pi's stream. The
checked-in P3 records predate this revision (no `record` version line, no
`sealed`/`judged`, optional `retry`); P5 regenerates the fixtures to the
revised shape.

**Paper design at revision time (historical — since grounded by P6, above):** `chose`, `loop_done`,
`parallel_done`, `hook`, `hash_drift`, `signal` (P4 produced real signal
records but with pre-revision fields), and `tool_call` for
mark/continue/select. Also the `aborted` → `timeout`-vs-`signal`
discrimination: P3 stamped `timeout` on P1's abort dump by foreknowledge (the
abort there came from a test timer, not a stage clock), and the one dump with
a genuine clock expiry (P2's) was never replayed — P5 must produce a
clock-fired `timeout` end-to-end. The adversarial audit also showed P3's Q2
(options-with-rungs) was answered by constants the transformer invented and
Q5's captures were reconstructed — the *vocabulary* for both is right, but a
real reader resolving real rungs has never fed it. P5 closes exactly this:
real option resolution, a chooser scenario, and the record writer gathering
runtime facts from the actual run rather than foreknowledge — with a
cross-check that runtime-stamped fields never contradict Pi-fed fields in the
same record (P3's abort record did).

## Context

The record is the spec's biggest promise with the least text behind it — the
vocabulary was deliberately shaped by prototype (P3, replaying eleven real Pi
event dumps from P1/P2 through a transformer) rather than invented on paper,
because its ceiling is what Pi actually emits. The adversarial review then
completed it against the spec's full surface: signal-stage state, the session
reference, the `output` check, chooser execution facts, which-gate-failed,
honest PARALLEL fields, the format version, `retry` always present, and the
`rejected` cause — each traceable to a spec sentence the first draft could
not write. Spec frictions were folded back into record.md (identity presence,
run-directory scope, the cause-table additions under invariants 45–48).
