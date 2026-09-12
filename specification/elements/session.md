# The session

> **Stability: stable.**

A session is the log of everything a model has said and done inside one stage:
its turns, its tool calls, the results those calls returned, and its reasoning
where the provider exposes it.

Every stage gets a fresh one. A session belongs to a stage and ends with it, and
what reaches the next stage is the output, never the session
([the stage](stage.md#the-agent-loop)).

## The session is the runtime's

The format does not define what a session file looks like. A runtime built on
one agent library will write that library's format; a runtime built on another
will write a different one. Both are correct.

What the format defines is the boundary: **the record is standardized and the
session is not** ([the record](record.md)).

| | The record | The session |
| --- | --- | --- |
| Answers | what happened | how it got there |
| Format | specified here | the runtime's own |
| Written by | the runtime, as facts land | the agent library |
| Depended on by | other programs | people, and the runtime's own tools |

The record holds a reference to each stage's session, not its contents. A reader
who wants the summary reads the record; a reader who wants the transcript
follows the reference and asks the runtime to open it
([inspection](inspection.md)).

That split is what lets the record be a contract. A standardized record can be
parsed by anything, forever, while sessions stay free to look like whatever the
underlying agent library produces.

## What a runtime must do with a session

- Write one per stage, and keep it for as long as the record that references it.
- Name it so the record can point at it. One session covers every attempt of one
  repeat, because a held agent keeps working in the session it already had.
- Append to it. A session is a growing log, and a held agent's continuation
  lands in the same file as the work that preceded it.
- Open it on request, through [the inspection commands](inspection.md). Rendered reads use bounded stable pages. Raw reads retain their separate exact-byte bound.

A session holds no system prompt. What the model was asked at the start of a
stage is kept beside the session instead
([the record](record.md#what-is-kept-beside-it)).

## Holding an agent

When a check fails, the reason is appended to the session and the model
continues from there. Everything it has already said and done stays in front of
it.

That is what makes gating cheap. The session is the accumulated work, and a
runtime that keeps it is charging for one more turn where one that discarded it
would charge for the whole stage again ([invariant 21](invariants.md)).

## What the record takes from it

Per stage: how many turns, what they cost in tokens, which control decisions
were taken, and how the loop ended. Those are facts about the run and belong in
the record. The turns themselves — the tool-by-tool history among them — stay
in the session.
