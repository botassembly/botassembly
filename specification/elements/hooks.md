# Hooks

> **Stability: stable.**

A hook is an executable in a stage folder, named for when it runs.

| Hook      | Runs                          | May change   |
| --------- | ----------------------------- | ------------ |
| `before`  | before the agent loop         | `$INPUT`     |
| `success` | after the output passes every check | nothing   |
| `failure` | after the stage fails         | nothing      |

Each belongs directly in the stage folder, not in its `gate/` folder. Each
needs its executable bit set and a shebang, or is a compiled binary, so any
language will do. An extension is for whoever reads the folder; the runtime
ignores it ([the stage](stage.md#what-a-stage-folder-holds)). This
extension-independent hook recognition does not apply inside `gate/`.

## How a hook is run

A hook is an ordinary process, started with the same slots in its environment as
the agent gets — `$INPUT`, `$OUTPUT`, `$TMP`, `$SKILLS`, `$PWD`, and
`$SUBFLOWS` when the stage has subflows in scope — over the caller's
environment, which passes through beneath them
([slots](slots.md), [invariant 43](invariants.md)).

`failure` gets two things more, because a hook that reports a failure should be able to say what happened. `$CAUSE` holds the one word from [the cause vocabulary](record.md#what-it-names). `$REASON` holds the path to retained captured text when one exists. The capture contains a failing check's output, an agent's refusal, or an agent-reported fault's reason.

It changes things by writing files, not by piping bytes. `before` rewrites,
adds, or removes the files in `$INPUT`, and the agent sees what `before` left
there — the prompt names whatever is in the directory when the agent starts
([prompt construction](prompt.md)). This is what lets a hook work when
`$INPUT` holds three files from three branches, which a pipe could never
express.

`success` is different: it runs after the output passed every check, and the
output is no longer anyone's to change. The hook holds `$OUTPUT` as a path to
read — copy it, publish it, announce it — and the next stage sees what the
agent wrote and the checks judged. Bytes that differ at sealing are drift, and
drift ends the run ([the record](record.md)). A transformation of the output
is work, and work is a stage's job, not a hook's.

Whatever a hook prints on stdout and stderr is captured as diagnostics and kept
with the run. It is not the hook's output; the files are.

## Exit codes

A hook's exit code counts.

- `before` exiting non-zero fails the stage before the agent has run at all, and
  the record names `before` as what failed.
- `success` exiting non-zero fails a stage whose output had already passed every
  check.
- Either way the cause is `rejected`: the assembly's own machinery said no,
  which is neither the agent refusing nor anything being broken
  ([the record](record.md#what-it-names)).
- `failure` runs after the fact. Its exit, timeout, inability to execute,
  or output overflow is diagnostic evidence only: its capture and hook event
  remain in the record, but it cannot replace the stage's existing ending. A
  hash-recheck drift is recorded as `hash_drift` before the hook starts, so no
  hook event or capture exists; it likewise cannot replace the ending.

`126` and `127` are the shell's, not the hook's — a gate or `before` or
`success` hook that could not be executed is a broken assembly, not a verdict
([the runtime](runtime.md#exit-codes)). The same failure-hook breakage is
recorded as diagnostic evidence without changing the failed stage's ending.

A hook gets the stage's `timeout` as its own budget, counted from when the hook
starts. It does not compete with the agent for a share of one clock, because a
hook that is malformed should fail the same way every time rather than depending
on how long the agent happened to take.

## When they run

A hook runs once per stage. An agent held back by a failing check has not left
the stage, so being sent back does not re-run `before`.

`failure` runs whenever a stage fails, whatever failed it — a check, a refusal, a timeout, an agent-reported `fault`, `before`, or `success`. It does not run when a signal ended the stage. When `before` was what failed there is no output for it to look at, and `$OUTPUT` names a file that was never written. When `success` was what failed, both hooks ran, each once.

## Stage level

A hook belongs to one stage, and a stage is the smallest thing that has an input
and an output to bracket. A flow that wants its request normalized puts a
`before` on its first stage; a flow that wants its result published puts a
`success` on its last.

## What hooks are for

Injecting policy without touching what the stage says: preparing a worktree,
scanning an output for secrets, normalizing an input into the shape the prompt
assumes, publishing a result somewhere.

The division is that the author of a flow writes stages, and whoever runs the
flow somewhere particular writes hooks.
