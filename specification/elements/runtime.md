# The runtime

> **Stability: stable.**

A runtime is a program that takes an assembly and a request and runs it. This is
the contract every runtime meets, whatever language it is written in and however
many model providers it supports.

It is an ordinary command-line program. It reads input, writes output, exits
with a code. It executes the folder as written and never modifies files in the
assembly.

Two runtimes given the same assembly resolve it identically: the same stages,
the same order, the same options from the same rungs, the same refusals. What
happens once a model is running depends on the model, so a run is not
reproducible — the reading of the folder is
([conformance](../conformance.md)).

## It is a POSIX program

The format leans on the shell's conventions rather than inventing its own.

### Exit codes

| Code    | Meaning                                          |
| ------- | ------------------------------------------------ |
| `0`     | success                                          |
| `1`     | failure — it ran and did not pass                |
| `2`     | the run is impossible — the assembly, the invocation, or the machinery beneath the run is wrong |
| `126`   | reserved: found but not executable               |
| `127`   | reserved: not found                              |
| `128+n` | killed by signal `n`                             |

A stage's exit code becomes its flow's, which becomes the run's.

`2` is the run being impossible, whenever that is discovered. Almost always that
is before anything runs — the assembly or the invocation is wrong — and then
there is no record. A gate or `before`/`success` hook that cannot be executed, or that runs out of
time, is the same fault found late, and a failure in the machinery beneath the
run — cause `fault` — lands here too: the run exits `2` and the record it had
already started says where ([causes](record.md#what-it-names)). A failure
hook's corresponding breakage is diagnostic evidence only and keeps the stage's
prior failed ending.

POSIX gives `126` and `127` to the shell, so a gate with a bad shebang or a
missing interpreter exits `127` without ever running. Read as a verdict, that
would send an agent back to fix work that was fine. A runtime treats `126` and
`127` from a gate or `before`/`success` hook as a broken assembly, not as a
decision, and fails the run. A failure hook's corresponding breakage remains
recorded diagnostic evidence and keeps the prior failed ending.

A gate child that exits `75` with nonempty combined captured output instead reports an external blocker. Its stage and run exit `1` with cause `blocked` and the gate's bounded terminal view as their reason; they do not publish exit `75`. The exact output remains in the check capture. The output is kept unsealed and judged, the failure hook runs, and the flow stops. A silent `75` remains an ordinary failing gate. This verdict belongs only to captured, hashed executable gates, never to hooks, other checks, control tools, provider or model output, or model prose.

Everything distinguishes "we never started" from "it ran and failed", because
those call for different responses from whatever invoked the runtime.

Every new root or resumed run establishes one valid [home installation identity](home.md) before run birth. A missing record makes the runtime initialize the home through atomic create-if-absent publication. Concurrent first runs use the published winner. An existing valid identity remains unchanged. An invalid record refuses the run before provider contact, run-name reservation, run-directory creation, `run_start`, or id-file publication. The runtime passes that one value to every subflow child without rereading the home.

An unexpected failure after Bot creates a run directory but before it finishes writing `run_start` is an unborn-run fault. Its one-line reason names the failed preparation operation and occupies at most 2,048 UTF-8 bytes. Expected refusals and preparation faults use one cleanup result path. Bot attempts to remove the directory while the run-name reservation remains held. A removal failure replaces the earlier result with a bounded cleanup fault and does not claim that cleanup succeeded. Bot then attempts to release the reservation. Failures after `run_start` keep the ordinary started-run behavior.

### Streams

Standard input is the request when the request arrives that way
([invocation](invocation.md)). On success the run's output goes to standard
output; diagnostics always go to standard error. A run whose output is piped
into another program prints nothing else on that stream. A run that ends
nonzero names its cause on standard error — and the reason behind it, when
there is one — so standard output carries only output. That reason is spelled
the way [a reading](inspection.md) spells one: the run's own text cannot
repaint the line it is printed on. While standard error is
a terminal, a run names each stage there as that stage starts: a display for
whoever is watching, so what a capture receives is unchanged and the record
holds no line of it.

`bot run start` and `bot run resume` use the existing start and resume runtimes. Human mode keeps those bytes and diagnostics. Structured mode writes one newline-terminated version-1 `bot.run.result` document to standard output after every started run and writes no progress or terminal diagnostic. The document names the run, installation identity, start, completion state, exit, cause, recorded ending, terminal stage, bounded reason, correlation, and accepted output only when each fact exists. The result projects the installation identity from the successfully written `run_start` object. It does not reread the home. A resumed result also names its donor and always reports the count of durably appended carried stages. It includes the ordered identities only when the complete result fits and otherwise states that it omitted them. A nonzero started run remains a result and preserves its exit. A failure before `run_start` uses the common error document on standard error and creates no durable result.

The complete structured result occupies at most 65,536 bytes. An accepted output appears inline as complete UTF-8 or base64 only when the whole document fits. Otherwise the result carries only the output's record-relative path, extension, byte count, and SHA-256. A reason carries its original byte count, a truncation fact, and a UTF-8-safe prefix of at most 2,048 bytes. A writer failure may name a started run with `complete: false`; it supplies no invented ending time.

### Run id file

The option `--id-file PATH` is accepted by `bot run start` and `bot run resume`. It writes the run's id after `run_start` and before any stage event or work. The option does not change the command's existing standard output. Inability to publish a requested id is a machinery fault: the run ends with exit `2` before any stage executes.

### The environment

Slots are environment variables — `$INPUT`, `$OUTPUT`, `$TMP`, `$SKILLS`,
`$SUBFLOWS`, `$PWD`. The runtime exports them into the agent's environment and
into every process the agent starts, and the shell expands them like any other
variable ([slots](slots.md)).

The rest of the environment passes through: an agent, hook, or gate sees the
caller's environment beneath the slots — that is how a script finds `PATH` —
and the slots unconditionally overwrite anything of the same name
([invariant 43](invariants.md)). Provider credential environment names consumed
by the parent and `BOT_HOME`, the runtime's own bot-named variable, are
scrubbed before anything agent-side runs ([the home](home.md)). Every process
the run starts also receives `$BOT_RUN_ID`, unconditionally replacing any
caller value with the basename of the run's directory, so its work can name the
run without learning that directory's path.

### Signals

A runtime handles `SIGINT`, `SIGTERM`, and `SIGHUP`. On any of them it stops
starting new work, terminates running children, writes down what it knows,
destroys settled `$TMP` directories, and exits: 130 for `SIGINT`, 143 for
`SIGTERM`, 129 for `SIGHUP`. "Stops starting
new work" includes hooks: a `failure` hook does not run for a stage a signal
ended — the run is dying, and the `signal` events are the story
([invariant 44](invariants.md)).

Cancellation is checked between units of work, not only at the end, so a model
in the middle of a tool loop stops at the next boundary.

A stage cancelled between its agent stopping and its checks finishing is
recorded with cause `signal`: its output is kept, unsealed, and the record
claims nothing judged it. Nothing is discarded and nothing is called a failure
that was never checked ([invariant 17](invariants.md)).

`SIGKILL` cannot be handled. A run killed that way leaves an incomplete record,
and a runtime recognizes an incomplete record as incomplete rather than reading
it as a result.

A dead run is dead ([invariant 44](invariants.md)). Nothing resumes across the
process: holding an agent happens within a stage within a live run, and
invoking again after a signal is a new run. A caller may start a new run with `bot run resume RUN` from independently verified
sealed stages of a prior run; the dead process and its session are never
resumed.

### Liveness

A run holds a lock for as long as it is running, and the lock says so by being
refreshed: its timestamp moves while the process lives, and a process that
stopped stops moving it. That is how status reads `running` versus `crashed`
and management makes its conservative checks, which the record alone cannot
do — a killed run and a working one look identical from a last line that is
not `run_end` ([inspection](inspection.md#bot-run-list)).

The lock sits beside the run's directory rather than inside it, because the
directory holds what the record specifies and nothing else, and a run is
archivable as a unit ([the record](record.md#what-is-kept-beside-it)). A
handled signal releases it on the way out. `SIGKILL` releases nothing, and
that is the point: the lock stops being refreshed and goes stale within
seconds, making the run read as crashed.

The judgment is a comparison of timestamps, so it can be wrong for a moment. A
machine asleep past the stale window wakes with every live run briefly reading
as crashed, until the next refresh. A stale timestamp does not prove death.
Management treats a physical run lock as a live claim. The window is seconds,
and the race is stated here rather than engineered around.

Nothing bounds a run as a whole — no deadline, no cost budget, no disk quota. A
run ends when its stages do, and supervising it is the operator's job.

An assembly's `tmp-max-bytes` is a ceiling on the readable bytes below a live
stage's `$TMP`, defaulting to one GiB (`1024 ** 3`). While the stage gate is
active, the runtime samples the temporary directory's backing path. A sample
strictly above the ceiling faults the stage and run with exit `2`; an unreadable
or vanished subtree contributes zero and does not stop its readable siblings
from being counted. This is sampled enforcement, not a privileged quota or a
byte-exact instantaneous promise, and it applies whether `$TMP` is stage-local
or flow-shared.

## Running a stage

1. Bind the stage's slots: a fresh `$INPUT` holding one named file per source,
   an empty `$TMP`, a path for `$OUTPUT`, the flattened `$SKILLS`, and an empty
   `$SUBFLOWS` when any subflow is in scope.
2. Run `before`, if present. What it writes is the agent loop's input.
3. Run the agent loop until the agent stops, refuses, reports a fault, or
   crosses the stage's `timeout` — which covers every round of the agent's
   work, not each one separately; checks and hooks run on their own clocks
   ([invariant 22](invariants.md)). An agent that crosses it is terminated and
   the stage fails. Termination is a request a provider may ignore: work still
   unsettled when the stage ends is recorded as unreconciled, neither bounded
   nor waited for.
4. Check that `$OUTPUT` exists, then check, in order and skipping any that is
   absent: the checklist, the schema, the gate. The first ordinary failure ends
   the round; a gate's evidenced exit `75` is an external blocker and ends the
   stage.
5. On an ordinary failure, put its output into the same session and let the
   agent carry on, up to the stage's `retries`. The agent is **held, not
   restarted**.
6. On a refusal or reported fault, skip step 4 entirely and fail the stage. A
   refusal exits `1` with cause `refused`; a reported fault exits `2` with cause
   `fault`. Neither spends a retry.
7. Before a normally completed stage settles, inspect `$TMP`. If it has entries,
   warn the held agent once that the directory is destroyed when work ends, list
   the entries largest first, and offer `clean-temp` or finishing anyway. The
   warning names `$OUTPUT` for output-accounted evidence and `$PWD` for
   later-stage material. It spends no retry and does not clean anything. An
   empty `$TMP`, refusal, or signal has no warning; after the warning the next
   completion may settle with `$TMP` empty or not.
8. Run `success` or `failure`, according to the outcome.
9. Seal the output and move on. When a stage settles, destroy its `$TMP`; a
   flow-shared `$TMP` remains until that flow settles. This cleanup applies to
   every settled outcome, including a refusal, fault, or handled signal. A
   `SIGKILL` cannot settle and leaves its temporary directory behind. A
   teardown that fails never displaces the settled outcome: the failure is
   recorded as its own `tmp_teardown` event with its reason
   ([the record](record.md)), and the stage's ending stands. A stage
   that did not succeed stops the flow.

The holding in step 5 is the demanding part. A runtime must be able to intercept
the agent's attempt to finish and resume that same session in place, with the
check's output appended. Resuming is not re-running: a runtime that answers a
failed check by starting the stage over from the prompt does not implement this
specification, because it charges for the work twice and throws away everything
the agent learned.

## Control tools

Almost everything about control is placement — the graph is the folder tree, and
no agent has any say in it ([the control graph](graph.md)). There are seven
places where the format does want a judgment a model is better at making, and
each is a tool the runtime provides.

| Tool     | Who has it                                    | What it does                           |
| -------- | --------------------------------------------- | -------------------------------------- |
| mark     | any stage with a checklist                    | moves one item to `done` or `skipped`  |
| refuse   | every stage                                   | declares the stage cannot be completed |
| fault    | every stage, `LOOP` question, and `CHOOSE`    | reports that the stage cannot continue |
| continue | the last stage of a `LOOP` whose body asks    | says whether another repeat is needed  |
| select   | the agent of a `CHOOSE` whose body asks       | names one of the options               |
| subflow  | any stage with a subflow in scope             | runs flows and returns their outputs ([subflows](subflow.md)) |
| clean-temp | every stage and `LOOP` question              | empties only that stage's `$TMP` contents |

That is the whole list, and it is meant to stay short. A tool here is an agent
being asked a question the format cannot answer on its own; anything an author
can express in a folder name does not belong here. When an assembly routes, no
tool is added: the assembly agent uses `subflow`, with every flow in its scope
([running the assembly](invocation.md#running-the-assembly)).

Each tool's arguments are fixed, so two runtimes record the same decision the
same way:

- **mark** takes the item's number — 1-based, in the order the checklist lists
  them, so two identically worded items stay distinct — a state, `done` or
  `skipped`, required evidence, and for `skipped` a reason. Evidence is an
  unpoliced string naming the proof; a missing or empty one rejects the mark.
- **refuse** takes a reason.
- **fault** takes a reason.
- **continue** takes an answer, `continue` or `stop`, and a reason.
- **select** takes a name from the list the runtime supplied, and a reason.
- **subflow** takes a batch of calls ([subflows](subflow.md#the-call)).
- **clean-temp** takes no arguments and empties only the `$TMP` directory the
  runtime attached to the stage.

Every decision that has one is recorded with the reason the agent gave, and a
mark with its evidence; `clean-temp` records the decision `clean` and no path
([the record](record.md)). None of them lets an agent change what
is checking it: it can say it is finished, it can say it cannot finish, and it
cannot touch the checklist, the schema, or the gate.

**Refusal** deserves its own note. An agent that cannot do the job says so and
leaves. The refusal skips every check, spends no retries, fails the stage, and
stops the flow, and the agent's own words for what went wrong are what the run
is left holding. It means the same thing wherever it lands: an agent held by a
failing check may refuse instead of trying again, and the agent of a `LOOP`
asked its question may refuse instead of answering, and in every case the stage
fails with the reason — even one whose checks had already passed.

A reported **fault** also skips checks and retries, stops the flow, and retains
the agent's reason in the stage and run endings. It ends with exit `2` and
cause `fault`, including when it is reported by a `LOOP` question or `CHOOSE`.

## The agent's tools

Without a stage `access` declaration, the model receives read, write, edit, and Bash tools. Direct file tools accept absolute paths. Bot does not confine them to the working directory.

A declared access policy uses the `access` field. Bot enforces the access policy at its model-facing dispatch of direct tool calls. The access policy is an instruction. The access policy does not provide a security boundary or operating-system containment. An allowed executable can reach outside the policy through its configuration, aliases, and subprocesses when the operating system permits it. Hooks and gates also run with the operator's filesystem and network authority.

Bot retains reported direct tool calls in retained model sessions and denied direct calls in the record. Bot does not watch the filesystem or claim a complete list of changes. A command, script, alias, subprocess, or outside actor can change files without a distinct reported tool call. An operator must supply external containment before running an untrusted assembly or model ([invariants](invariants.md)).

## Model sessions

Every stage gets a fresh session. A runtime does not carry conversation from one
stage to the next; what reaches a stage from earlier stages is their outputs.

A model turn ends in one of a few conditions, and a runtime handles each
distinctly: the model finished, the model asked to call a tool, the model hit its
output limit before finishing, the provider failed, or the work was cancelled.

Provider failure is a condition to be inspected, not an exception to be caught. A
runtime that assumes success whenever nothing was thrown will record outages as
successful work. Hitting the output limit is not a failure either; it is a
truncated turn, and a truncated turn is never read as the agent having
finished ([invariant 47](invariants.md)). The runtime continues the agent's
work; how is the runtime's business, not this specification's.

A runtime may retry a transient provider failure. Whether it retries, how many
times, and after what delay are the runtime's business, not this
specification's. What is required is observable: every runtime-selected retry
is written into the record ([the record](record.md)), retrying never exceeds
the stage's deadline, and a provider failure that remains fails the stage with
cause `fault`, never as a verdict on the agent's work. Its final reason starts with the outer error message. When the error has a direct cause that is a non-array object with a nonempty string `message`, the reason adds `: ` and that message. A nonempty string `code` on that same object adds ` [CODE]`. Nested or malformed cause values are ignored. The runtime applies its existing 2,048-byte UTF-8-safe bound after composing the reason and carries the same text in the assistant session, `stage_end.reason`, and `run_end.reason`.

A runtime owns the tool loop — taking the model's request, executing it,
returning the result, continuing until the model stops — and records what each
turn cost in tokens, attributed to its stage.

## What the runtime knows and the agent does not

The agent reaches everything through slots. It is not told where the assembly
lives, where the record lives, where its scratch really is, or where anything
checking it lives. It is not told its provider, its model, its timeout, or how
many retries remain.

This information hiding directs the agent's attention and reduces accidental interference with the machinery. It does not restrict what the operating system lets a process reach.

Bot is not a sandbox. Slots do not hide their values from a shell, and `access` does not contain an allowed process. The retained sessions show only direct tool calls reported by the model harness. The record separately shows denied direct calls. Neither source watches the filesystem or lists every side effect.

## Running child processes

Hooks and gates are ordinary processes.

- A child gets the stage's `timeout` as its own budget, counted from when it
  starts, so it fails the same way every time rather than depending on how long
  the agent took.
- Crossing it terminates the child. A gate or `before`/`success` hook that
  hangs exits `2`: the assembly is wrong, never the agent's work. A failure
  hook's timeout, inability to execute, output overflow, or hash-recheck drift
  remains diagnostic evidence and cannot replace the failed stage's ending.
- Termination is `SIGTERM`, then `SIGKILL` after a grace period, applied to the
  whole process group rather than just the process that was spawned.
- A runtime tracks children it detached and cleans them up on exit. It records
  each detached process group in the run directory before starting it, and
  removes that evidence only after the normal termination sweep has accounted
  for the group. A `SIGKILL` can leave that evidence for a later `busy` reader;
  a malformed or in-progress entry is conservatively busy. A descendant that
  escapes its process group with `setsid` or a double fork is outside ordinary
  hook and gate containment.
- A gate or `before`/`success` hook's exit code is its verdict, except for
  `126` and `127`; only a gate's evidenced `75` is the external-blocker
  verdict. Those failures retain terminal force; a failure hook's exit is
  diagnostic evidence only.
- Output is captured as bytes, never as decoded text. Decoding truncates binary
  output and splits multi-byte characters at chunk boundaries.
- Output is bounded at 16 MiB, stdout and stderr together; crossing it
  terminates the child. A gate or `before`/`success` hook exits `2`, for the
  reason a hang does; a failure hook keeps the prior failed ending. The capture
  keeps what arrived before the cut.
- A runtime writes a child's stdin and then closes it, so a child blocking on
  end-of-file terminates. A child that exits without reading its input does not
  fault the run.

## Input and output

`$INPUT` is a directory holding one named file per source; `$OUTPUT` is one file
([slots](slots.md)). Bytes are preserved exactly.

Once an output has passed its checks and `success` has had its say, the runtime
seals it: it copies the bytes into the run's directory and reads the next stage's
input from that copy. Whatever happens to the original afterward changes
nothing, and the copy is what the record holds
([the record](record.md)).

## The record

Every run that starts produces a record, written by appending. Facts land as
they happen and are never edited, and any summary is computed from those facts,
so a summary cannot contradict the events ([the record](record.md)).

## Refusing an assembly

A runtime validates the whole assembly before running any of it. A malformed
assembly is a usage error: exit `2`, no record, because nothing ran.

A refusal carries a code, the path at fault, and a sentence
([refusals](refusals.md)). Every entry in an assembly
folder is either understood or refused, and nothing is silently ignored.

## Identity

Every stage has an identity derived from its position in the folder tree, from
what the author wrote rather than from what happened at run time. A stage inside
a loop or a branch runs more than once, and each occurrence is distinguishable.

A runtime records the assembly's content hash, covering every visible file in
it — dot-entries are outside the assembly and outside the hash
([invariant 13](invariants.md)). Each
time it runs an executable — a hook, a gate — it also records the
hash of that file's bytes as they were at that moment. A gate or `before` or
`success` hook whose hash disagrees ends the run there: exit `2`, with the
record naming the file that changed. Failure-hook hash drift is recorded as
diagnostic evidence and keeps the failed stage's ending. The assembly may not
change under a run ([invariant 14](invariants.md)).

## Concurrency

Stages in a sequence run one at a time. Branches of a `PARALLEL` run at once, bounded by that stage's `width` ([parallel](parallel.md)). Items in a `FANOUT` run their selected subflow at once, bounded by its `width` ([fan-out](fanout.md)). Both controls record results in authored name order. The recorded order never implies completion order.
