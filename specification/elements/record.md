# The record

> **Stability: stable.**

The record is what a run writes down. Every run that starts produces one; a run
refused before it starts produces none, because nothing happened.

Successful completion of the initial `run_start` write separates an unborn run from a started run. An unexpected preparation failure before that boundary returns a bounded one-line fault. Expected refusals and preparation faults use the same unborn-directory cleanup while the reservation remains held. A cleanup failure replaces the earlier result with a bounded cleanup fault and leaves the directory intact. Reservation release is still attempted. A caller-owned run-id file is not changed before the boundary.

## How it is written

JSONL: one JSON object per line, appended as it happens, never rewritten. It
lives in the run's directory under the home, which the agent never learns about
([the home](home.md)).

Facts land as they happen and are never edited afterward. Any summary is
computed from those appended facts, so a summary cannot contradict the events it
summarizes.

A stage's events end at its `stage_end` — nothing of that stage's follows it.
Work the runtime abandoned and never saw settle is recorded as unreconciled,
with its window, and its spend is in no total.

One diagnostic may stand after a stage's `stage_end`: a `tmp_teardown` event
records a temporary-directory teardown that failed after the stage settled,
with its reason. It names the stage the way `run_end` does, and it changes no
ending — the settled result stands ([running a stage](runtime.md#running-a-stage)).

Every line carries the same first fields — when it happened, what kind of event
it is, and which stage it belongs to — so the file is filterable with `grep`
before anything parses it, and readable with `jq` when something does.

The first line names the record shape that wrote it ([invariant 48](invariants.md)). A program that has to guess which shape it is holding cannot promise that it read the file correctly.

Bot remains pre-release software. The first line names current record shape `1`, and the current reader refuses any other shape instead of guessing. Additive fields on known events stay in shape `1` and readers ignore fields they do not recognize. Bot carries no record migration machinery or pre-release compatibility branches. Version `0.0.1` is the first public alpha; version 1.0 is the first promised cross-version compatibility boundary.

Appending is what makes a run readable after a process crash. Completed
appends leave complete newline-delimited lines readable after the writing
process crashes, and a truncated last line costs one event rather than the
file. The newline that ends the last line terminates it rather than starting a
blank one, and a blank line anywhere in a record is not a line the record wrote,
so bot refuses the file rather than handing back something shorter than what is
on disk.

Appending the terminal `run_end` makes that line visible to readers before the
subsequent record-file sync promise finishes. That sync applies only to the
record file and does not sync the run directory, the run tree, or its other
files. A consumer can therefore observe a visible terminal event and later,
after power loss, encounter an incomplete run tree. Before the record sync
finishes, the previously observed terminal line itself also lacks the
completed-sync guarantee.

A run killed partway leaves everything up to the kill, and an incomplete record
is recognizable as incomplete rather than readable as a result.

The record never claims more than what happened. A feature that would blur that
is wrong by definition.

## How it is read

One reader classifies a bounded shape-1 record as `valid`, `incomplete`, or `invalid`. A valid record begins with one matching `run_start`, starts every stage attempt before its work or ending, uses legal terminal cause and exit pairs, records at most one container ending for an identity, records at most one matching outside signal, ends once with `run_end`, and contains nothing after that ending. Known events carry parseable timestamps and usable stage identities. An incomplete record is an empty newborn record or a possible prefix without `run_end`.

The semantic reader retains the current total safety bounds. It fixes one held descriptor snapshot at no more than 1 MiB and 10,000 newline-delimited segments, then validates and parses complete lines incrementally. The final unterminated segment counts toward the line bound and must be valid UTF-8, but the reader omits it as torn. The reader publishes nothing from a snapshot that fails its final file and path stability checks. Removal of the total bounds remains later work.

The explicit raw inspection path does not use the semantic reader or its whole-file bounds. It copies a fixed-size snapshot from one safely opened regular-file descriptor. Raw bytes preserve evidence without endorsing the record as a possible story.

One unterminated final segment is omitted. The remaining possible prefix is incomplete when it has no `run_end`. The same segment is invalid when a preceding complete line already recorded `run_end`, because bytes followed the terminal fact. A malformed interior line is always invalid. Diagnostics name the first rejected line and rule. A final segment that looks like complete JSON but lacks its terminating newline is still an unterminated segment. The reader does not promote it into a durable event.

The structural reader does not duplicate the writer's detailed rules for paths, check order, hooks, controls, container aggregation, workspaces, or retained artifacts. Writer and conformance tests own those rules. Each operation validates the fields and artifacts that authorize its own action. A missing or malformed action-authorizing fact returns no artifact or authorization. A valid parent story does not prove that a retained request, output, capture, session, or child record still exists or agrees with the parent.

A handled outside signal records one matching `signal` fact and uses `SIGHUP/1/129`, `SIGINT/2/130`, or `SIGTERM/15/143`. A stage or child terminal may record the matching signal cause before the queued signal event. That prefix remains incomplete. The final `run_end` agrees with the recorded outside signal. Internal cancellation and root lock compromise use `fault/2` and emit no outside-signal event.

Detailed field shapes remain mechanically checked against every writer constructor. Child traversal separately compares parent and child identities, flow, request descriptors, retained bytes, and terminal outcome. Resume, artifact reads, session reads, search, busy detection, assembly management, and cleanup each reject malformed facts at their own use boundary.

Cleanup never treats an invalid event as deletion authority. A stopped structurally invalid run can still be selected by its exact enumerated name, its bytewise keep position, or the calendar-valid UTC second in a writer-shaped run name. Removal relies on independent run-lock, process-group, selected-name, and owned-tree evidence. Missing, unreadable, unsupported-version, and non-file records remain refused under automatic selection.

## What it names

The table below is the mechanically checked inventory of each event name and
its exact top-level field names. It keeps code and specification vocabulary in
step; the prose around it remains the authority for what those names mean.

| Event | Top-level fields |
| --- | --- |
| run_start | `record`, `runtime`, `ts`, `event`, `run`, `assembly`, `assembly_hash`, `flow`, `continued_from`, `correlation`, `installation_id`, `request`, `workdir`, `runtime_source`, `runtime_digest`, `lock_sha256`, `node`, `provider_adapter`, `runtime_tree_sha256`, `model_source` |
| run_end | `ts`, `event`, `stage`, `repeat`, `retry`, `exit`, `cause`, `reason` |
| stage_carried | `ts`, `event`, `stage`, `repeat`, `retry`, `from`, `output` |
| stage_start | `ts`, `event`, `stage`, `repeat`, `retry`, `received`, `options`, `slots`, `workdir`, `session`, `tools`, `skills`, `access` |
| prompt | `ts`, `event`, `stage`, `repeat`, `retry`, `prompt` |
| stage_end | `ts`, `event`, `stage`, `repeat`, `retry`, `exit`, `cause`, `output`, `sealed`, `judged`, `reason` |
| unreconciled | `ts`, `event`, `stage`, `repeat`, `retry`, `started`, `stopped` |
| tmp_teardown | `ts`, `event`, `stage`, `repeat`, `retry`, `reason` |
| provider_start | `ts`, `event`, `stage`, `repeat`, `retry`, `provider`, `model` |
| turn | `ts`, `event`, `stage`, `repeat`, `retry`, `provider`, `model`, `input`, `output`, `cache_read`, `cache_write`, `total`, `stop` |
| provider_retry | `ts`, `event`, `stage`, `repeat`, `retry`, `attempt`, `delay_ms` |
| provider_transport | `ts`, `event`, `stage`, `repeat`, `retry`, `transport`, `source`, `configured_transport`, `fallback_transport`, `events_emitted`, `phase`, `error` |
| gate_start | `ts`, `event`, `stage`, `repeat`, `retry`, `file`, `sha256` |
| check | `ts`, `event`, `stage`, `repeat`, `retry`, `check`, `file`, `exit`, `capture`, `sha256` |
| tool_call | `ts`, `event`, `stage`, `repeat`, `retry`, `tool`, `decision`, `evidence`, `reason`, `item` |
| tool_denied | `ts`, `event`, `stage`, `repeat`, `retry`, `tool`, `boundary` |
| subflow_call | `ts`, `event`, `stage`, `repeat`, `retry`, `call`, `flow`, `input`, `exit`, `cause`, `reason`, `child`, `depth`, `started`, `via`, `item`, `output` |
| chose | `ts`, `event`, `stage`, `repeat`, `retry`, `chose`, `declined`, `reason` |
| loop_done | `ts`, `event`, `stage`, `repeat`, `retry`, `repeats`, `ended_by`, `reason` |
| parallel_done | `ts`, `event`, `stage`, `repeat`, `retry`, `width`, `concurrent`, `branches` |
| fanout_start | `ts`, `event`, `stage`, `retry`, `received`, `items`, `subflow`, `width`, `max_items`, `manifest_bytes`, `manifest_sha256`, `plan` |
| fanout_done | `ts`, `event`, `stage`, `retry`, `exit`, `cause`, `concurrent`, `selected` |
| hook | `ts`, `event`, `stage`, `repeat`, `retry`, `hook`, `exit`, `capture`, `sha256` |
| hash_drift | `ts`, `event`, `file`, `expected`, `actual` |
| signal | `ts`, `event`, `signal`, `name` |

`loop_done.ended_by` records `stop`, `limit`, or the exact unsuccessful body cause: `refused`, `exhausted`, `rejected`, `blocked`, `timeout`, or `fault`. An outside signal has its own record sequence and does not add `loop_done`.

**For the run:** the version of the runtime that ran it, its home installation identity, its runtime
provenance, the assembly, its content hash, the request as supplied,
the caller-selected absolute root workdir, explicit donor provenance when it
derives work from a dead donor, and the exit code with its cause. Runtime
provenance is resolved once before the top-level `run_start`. Two fields are
required of every runtime: a checkout records `runtime_source` as `checkout`
and its Git `HEAD` as `runtime_digest`; without Git or a checkout, the source
is `unknown` and the digest is null. The remaining provenance fields are the
runtime's own environment identities — named by the runtime, not by this
specification. bot, a Node program, records `lock_sha256` (the exact-byte
SHA-256 of its colocated lockfile), `node` (the executing Node version),
`provider_adapter` (the resolved adapter manifest's `name@version`), and
`runtime_tree_sha256` (the observed Bot-owned source snapshot); a runtime
built on another stack records the equivalent identities for its own world.
Bot measures `package.json` plus every regular `src/**/*.ts` file immediately
before the top-level start. A recursive directory listing ignores symbolic
links and other non-file leaves. Bot sorts UTF-8 root-relative paths bytewise and
hashes `bot-runtime-tree-v1\0` followed by each file's four-byte unsigned
big-endian path length, eight-byte unsigned big-endian byte count, UTF-8 path,
and exact whole-file bytes. Listing or reading a selected file can fail before
`run_start`. The sequential observation is not an atomic tree snapshot. It
records bytes observed on disk but does not prove which modules Node already
loaded or protect against same-account mutation. Hashing work grows with the
trusted installed program. Every subflow child reuses its parent's values.
Older shape-1 records without `runtime_tree_sha256` remain readable.

Current writers require `installation_id` as a canonical lowercase UUID version 4 on every root and child `run_start`. A root writer establishes the home identity before run birth and records that value. A first run creates a missing record. Concurrent first runs record the one published winner. Historical shape-1 records may omit this additive field. The record remains shape 1.

**For each carried stage:** its normal identity, immediate donor run in `from`, and its copied self-contained `output` path and SHA-256. The output path is `stages/<stage>/1/<retry>/output.<ext>`, where the extension is the stage's current output type. Repeat-scoped stages cannot be carried. `stage_carried` occurs after `run_start` and before fresh work; it records work a new `bot run resume` run reuses without claiming a session, start, turn, check, hook, or end in that run.

**For an applicable resumed failure:** the first fresh plain root stage receives one newline-terminated JSON file no larger than 4,096 UTF-8 bytes. It names the donor run, stage, retry, exit, cause, optional reason, original reason byte count, and whether the reason was shortened. A missing reason is null. Shortening keeps a valid UTF-8 prefix. The new run retains the exact bytes under `resume/`, and the existing `stage_start.received` descriptor binds their selected name, path, and SHA-256. No new event or record shape is introduced.

**For each stage:** what it received, what it produced, its working directory,
its resolved options and the rung each came from ([invocation](invocation.md)),
which checks ran, how it ended, and what it cost in tokens. Each `stage_start`
carries `workdir`: `authored` is the stage's written relative path or null when
it inherited the root, and `resolved` is its path relative to the run root.
Neither is an absolute machine path. An output-bearing `stage_start` also
carries `slots`: the exact absolute strings supplied in its runtime environment
for `pwd`, `input`, `output`, `tmp`, and `skills`. When the runtime environment
also supplies `$SUBFLOWS`, the object carries that exact string as `subflows`.
The member is absent when no subflow is in scope. The object appears on every
attempt; a `CHOOSE` start has no `slots` because it has no `$OUTPUT`. A stage
with a declared model-tool boundary carries that validated policy in `access`.
Each denied model call adds a `tool_denied` event with only its attempt
identity, tool, and stopped boundary.

A `prompt` event carries the required prompt-construction sources for its stage
attempt. It is published after successful prompt construction and, when a
`before` hook is configured, after that successful hook has been recorded.
Terminal and rejected before hooks end gating without prompt construction or a
`prompt` event. Historical `stage_start` and `hook` events may carry the same
additive field; readers continue to discover those old carriers by the field's
presence.

How a run or a stage ended is one word from a short vocabulary beside the exit
code. The exit code says whether; the cause says why
([invariant 23](invariants.md)). A caller that needs to tell a refusal from
spent retries reads one field instead of the transcript, and the exit code
stays POSIX-small.

| Cause       | Exit    | When                                                |
| ----------- | ------- | --------------------------------------------------- |
| `success`   | `0`     | the output passed and was sealed                    |
| `refused`   | `1`     | the agent said it cannot do the job                 |
| `exhausted` | `1`     | the retries were spent with a check still saying no, or with an answer still not given — a chooser that never selected, a loop question never answered |
| `rejected`  | `1`     | the assembly's own machinery said no — a `before`/`success` hook that ran cleanly and exited non-zero, or a loop that reached `repeat` with its agent still asking to continue |
| `blocked`   | `1`     | a gate exited `75` with nonempty captured output, reporting an external condition that stopped the stage without a retry |
| `timeout`   | `1`     | the agent's clock ran out                           |
| `timeout`   | `2`     | a gate's or `before`/`success` hook's own clock ran out |
| `signal`    | `128+n` | killed from outside                                 |
| `fault`     | `2`     | the machinery failed — the layer beneath the run (provider, disk, the agent library), or an assembly executable found broken while running: a gate or `before`/`success` hook that could not execute, broke a passed output, or named a missing alternative — or the agent reported a fault. The record retains the agent's reason; machinery faults name the file. |

The same word can sit beside two codes because the cause names what happened
and the code names whose problem it is: an agent out of time is the work
failing, a gate out of time is the run being impossible
([exit codes](runtime.md#exit-codes)). A failure hook's timeout, non-execution,
output overflow, or hash-recheck drift remains its recorded diagnostic evidence;
it never replaces the failed stage's existing `stage_end` or propagated ending.

## What a record answers

A reader with the run's directory and nothing else — the record, the prompts,
the assembly it ran, the captures and the outputs in it; no sessions, no
runtime — can answer these, and a record that cannot is not a record:

1. What was asked: the request, byte for byte, and how it arrived.
2. What ran: which assembly at which hash, which flow, which stages, in what
   order, with what options from which rungs.
3. What each stage received and what it produced.
4. How everything ended: exit code and cause, for the run and for every stage.
5. What judged the work: which checks ran, what each said, and what the agent
   was told.
6. What the model was asked: each stage-repeat's system prompt and first turn,
   byte for byte.
7. What it cost: tokens per stage, and in total.
8. What was called: every control-tool decision and any reason it gave, every
   mark's evidence, and every subflow call with its input and outcome.

Everything else — the turns, the reasoning, the tool-by-tool history — is the
session's, reachable from here but never required
([the session](session.md)).

The public `promptConstruction` inspection reader exposes the recorded prompt
sources. It returns an available result with those sources when the event
carries `prompt`, and an unavailable result when a historical event does not.

**For each logical provider operation:** `provider_start` is appended before Pi invokes the provider. It carries the provider, model, and a copy of the current stage identity. A completed operation later produces a matching `turn`. A start without a turn records an interrupted or still-silent operation. Pi's internal transport attempts do not create additional logical starts.

**For each provider retry:** a runtime-decided retry has the current value-copy of
its normal stage identity, one-based `attempt`, and `delay_ms`; it says nothing
about adapter-internal attempts.

**For each provider transport:** when a provider adapter distinguishes
transports, the requested transport or the
adapter-published fallback fact, under the same `stage`, optional `repeat`, and
`retry` identity as its corresponding `turn`. A `provider_transport` event has
only the normal stage fields plus `transport` (`websocket` or `sse`) and
`source` (`requested` or `diagnostic`). A requested event says the runtime asked
the adapter for WebSocket; it does not say WebSocket was used. A diagnostic event is
an adapter fact, not an inference from that request: it additionally carries
`configured_transport`, optional `fallback_transport`, `events_emitted`,
`phase`, and `error` with only optional `name`, `message`, and optional `code`.
It names the fallback transport when the adapter supplied one, otherwise its
configured transport. Stacks, diagnostic timestamps, and adapter-only request
measurements are not record fields.

**For each gate start:** the current stage, repeat, and retry identity, the gate
file, and its pinned SHA-256. This event is appended after the executable is
rehash-verified and before the runtime waits for the gate. It does not report a
verdict: an interrupted run may retain only this start, while an ordinarily
completed gate follows it with the authoritative `check` event.

**For each check:** which check it was, its exit code, and everything it
printed. A completed gate check remains the authoritative verdict and retains
its capture, exit (including null), file, and SHA-256.

**For each control-tool call:** which tool, what the agent decided, and any
reason it gave ([control tools](runtime.md#control-tools)). A checklist mark is
recorded with its evidence; a `skipped` item is also recorded with why, which is
the entire point of allowing it to be skipped. `clean-temp` records `clean`
without a path, item, evidence, or reason.

**For each container:** what a `CHOOSE` chose and what it declined, how many repeats a `LOOP` ran and what ended it, and which branches of a `PARALLEL` ran and what each produced.

**For each fan-out:** the retained manifest descriptor, authored limits, complete sorted request plan, one sorted item disposition, measured concurrency, and terminal aggregate. A fan-out item uses `subflow_call` with `via: "fanout"`, its item id, and its verified successful output when one exists. Fan-out events carry no `repeat` under the root-only placement rule.

**For each subflow call:** which flow, the input, how it ended, and where the
child run is. The child is a complete run of its own, recorded under the parent
stage's attempt with its own record and sessions, and a descend flow's depth is
recorded with each invocation ([subflows](subflow.md),
[descend](descend.md)).

## Identity

A stage is identified by its path in the flow, and by two counters when it ran
more than once. Three fields, never one composite string:

```json
{ "stage": "03-recommend/02-critique", "repeat": 2, "retry": 1 }
```

`stage` is the path from the flow root, with the leading numbers kept, because
that is what the author wrote and what a reader can find on disk. A stage
written as one `.md` file drops the extension — `02-tail.md` is `02-tail` —
and a folder keeps the name it was given, so a container or a stage folder
called `01-wrap.md/` is recorded as `01-wrap.md`. A branch of a `PARALLEL` and
an alternative of a `CHOOSE` are already folders, so they appear in the path
and need no counter of their own — `02-assess/risk` says everything.

`repeat` is which time around a `LOOP` it was, matching the key on `LOOP.md`
([loop](loop.md)). `retry` counts attempts, so the first attempt is `1` and a
stage with `retries: 2` can reach `3`. Both start at 1. `retry` is always
present — attempts are always counted, and a field is never left out by
configuration ([invariant 46](invariants.md)). `repeat` appears
iff the stage sits inside a `LOOP`: placement, knowable before the run.

Three fields rather than one string means a reader filters on them without
parsing anything: every entry for one stage, every entry from the third repeat,
every entry that took more than one attempt. Anything that wants a single
display string composes one.

A run is named by when it started and a suffix that makes it unique:
`2026-07-30T14-22-08-a3f9` is the UTC start time to the second, `T` between
date and time and hyphens throughout so the name is a valid directory anywhere,
then four hex characters the runtime picks. The directory is created
exclusively — creation is the claim on the name — and two runs starting in
the same second differ in the suffix: the runtime re-rolls on collision.
Names sort by start time. A command that takes a run accepts the full name or any
prefix that matches exactly one.

## What is kept beside it

The run's directory holds the record, the request, the assembly the run ran, and
one folder per stage. A resumed run copies hash-verified carried outputs into its own stage tree and applicable bounded prior-failure evidence into its own `resume/` folder; it
never links to or modifies its donor. A run is self-contained for reading: what happened, what
was produced, what judged it, and how it was arrived at, in one directory that
can be read a week later, moved, or archived as a unit. Not for re-running — no
runtime, no provider and no workspace is in it.

```text
runs/2026-07-30T14-22-08-a3f9/
  record.jsonl
  request.txt
  assembly/
  stages/
    01-read/
      1/
        session.jsonl
        system.txt
        first-turn.txt
        1/
          output.txt
          checks/
            checklist.txt
    03-recommend/
      02-critique/
        2/
          session.jsonl
          system.txt
          first-turn.txt
          1/
            output.txt
            checks/
              gate.txt
          2/
            output.txt
            checks/
```

**`assembly/` is the run's own copy of the assembly**, taken when the run
started. Every instruction, schema, skill, gate and hook the run used was read
from it, so what ran is in the directory beside what it produced. An edit to the
tree it was copied from lands on the next run: to run your edit, start a run. A
subflow child runs the copy its parent took and keeps none of its own, so the
family's directory holds one ([subflows](subflow.md)).

Nothing bounds what those copies hold. A kept run keeps its copy.

The two numbered levels are the two counters from the identity above: the first
is the repeat, the second is the attempt within it. Both are always present,
even when both are 1, so there is one shape to read and no special case for the
stage that ran once.

**A session sits at the repeat level**, because a held agent keeps its session
across every attempt ([the session](session.md)). **An output and its check
captures sit at the attempt level**, because each attempt produces its own.

**The prompt sits at the repeat level too**: `system.txt` is the system prompt
the agent was built with, `first-turn.txt` the first thing it was asked — the
bytes as they were handed over, never rebuilt afterward. Every later round is
the session's: a send-back and a loop's question are turns in that file, not
files of their own.

A branch of a `PARALLEL` and an alternative of a `CHOOSE` are folders in the
path already — `02-assess/risk/1/1/output.json` — so nothing else is needed to
tell them apart.

## What a check printed

Every check's output is captured to a file under that attempt's `checks/`, named
for the check that produced it, and *then* handed to the agent
([gating](gates.md#what-the-agent-is-told)). A `gate/` folder's captures mirror
it: each gate's output lands under `checks/gate/`, named for the entry that
produced it — `checks/gate/01-lint.txt` — so several gates in one round collide
with nothing, each other included. The file is written first. A gate's capture is its exact output. The agent's session has the fixed frame [gate.md](gate.md#the-verdict) specifies followed by the gate's model view. The view is the exact valid UTF-8 output through 10,000 bytes or a deterministic bounded rendering that directs the reader back to the exact capture.

The record's line for the check names its exit code and points at the file. The
bytes live in the file because a check can print a test suite's entire output,
and a JSONL record stays readable by staying small. An external-blocker gate retains its actual exit `75`, executable file and hash, and exact evidence capture before the `stage_end` and `run_end` events record `blocked`/`1`. Gate-derived terminal reasons contain at most 2,048 UTF-8 bytes and direct a reader to the preceding `check.capture` when the exact output is longer or cannot be decoded as UTF-8.

This is what makes a failed stage diagnosable afterward. Three attempts leave
three outputs and three check captures, in order, so the question "what was it
told, and what did it do about it" is answered by reading a directory.

## Hashes

Every hash in the record is SHA-256. A file's hash is the hash of its bytes. The
assembly's hash is the hash of one text: a line per file, `path:hash`, paths
relative to the assembly root in name order ([invariant 41](invariants.md)) —
so two runtimes hashing the same folder agree, and a record can say which file
a mismatch is in. An executable file's line is `path:hash:x` instead, because a
gate's behavior depends on its executable bit and two assemblies differing only
in that bit are not the same assembly. Dot-entries are outside the assembly and
outside the hash ([invariant 13](invariants.md)).

The record holds the assembly's content hash, covering every file in the copy
the run ran.

The output gets the same treatment: it is hashed the moment its checks pass,
and bytes that differ when it is sealed end the run the same way a drifted
gate does — the window between passing and sealing is not a place bytes may
change, not for a `success` hook and not during a loop's question round. What
passed the checks is what is sealed, so long as the checks did not write to it
themselves — [a gate reads that file and does not write to it](gate.md), and
what follows when one does is that chapter's to say.

Each time the runtime executes something from the assembly — a gate, a hook —
it also records the hash of that file's bytes as they were at that
moment. A changed gate or `before`/`success` hook ends the run: exit `2`, with
this line naming the file. A failure-hook hash-drift record is diagnostic
evidence and keeps the failed stage's existing ending
([invariant 14](invariants.md)).

This exists because it happened. An agent read its failure feedback, found the
gate, rewrote it to exit zero, and passed. Ending the run is the response, not a
prevention — an agent can still reach the file, and the specification still
claims visibility rather than a sandbox — but a run whose machinery changed
under it does not continue, and the record says why it stopped.
