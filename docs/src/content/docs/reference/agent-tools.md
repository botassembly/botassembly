---
title: "What the agent can do"
description: "The tools and reach a stage's agent actually has when bot runs it."
sidebar:
  order: 7
---

*This page describes the tools and the reach the `bot` runtime hands a stage's agent — an implementation reference, not part of the runtime-agnostic format specification.*

The format says an agent gets every tool the runtime has
([the agent's tools](/specification/running/#the-agents-tools)); this page is
what that means in bot, concretely.

## The harness

A stage's agent runs in the pi agent library — `pi-agent-core`'s harness with
`pi-ai`'s providers, pinned and bundled with bot, consumed as an SDK
(ADR 0001, ADR 0002). `bot` never re-implements the model session, the tool
loop, or token accounting; it hands the harness a system prompt, a model, and
a tool list, and taps the events the harness reports into
[the record](/specification/record/).

## The general tools

Every stage, every attempt, gets four file-and-shell tools: `read`, `write`,
`edit`, and `bash`. They are pi's own tool implementations, wrapped so that
paths behave the way [slots](/specification/slots-and-skills/) promise:

- A path written as `$INPUT/read.txt` or `$OUTPUT` is expanded to its real
  location by bot before the tool touches the disk, so the agent addresses
  files by slot name and the tool echoes the slot name back.
- The shell a `bash` call gets holds exactly the environment bot composed for
  the stage — the slots as real variables, credential-shaped variables and
  `BOT_HOME` scrubbed — with inheritance from bot's own process turned off.
- Temporary files land under the stage's `$TMP` (`TMPDIR` points there too),
  which is scratch: kept for debugging, removed with the run.
- A path starting with `~` is refused with a sentence asking for the path in
  full. That is a guardrail against addressing the operator's files by
  shorthand, not a sandbox: absolute paths still reach anywhere.

## Network and reach

The runtime does not sandbox. The agent's shell commands run as bot's own user
and reach whatever the host lets that user reach — the file system by absolute
path, the network without restriction. `bot`'s boundaries are attention and
integrity, not containment: it scrubs credentials from the stage environment
and withholds the machinery's locations, and it is deliberately
sandbox-agnostic, so containment is the operator's to supply around it
([focused, not sandboxed](/principles/#focused-not-sandboxed)).

## The control tools

The format's five control tools — `mark`, `refuse`, `continue`, `select`,
`subflow` — are bot's tool names verbatim, and
[control tools](/specification/running/#control-tools) is the law for what each
does and who has it. What bot adds is the timing of disclosure. `subflow` is
wired only when the stage has subflows in scope, and stays available
throughout. The other four are switched per phase: a working stage sees
`refuse`, plus `mark` only when it has a checklist; the agent of a `CHOOSE`
sees `refuse` and `select`; and `continue` appears only after the work has
passed every check, when the loop's question is finally asked. Every call is
recorded with its decision, its evidence or reason, in the run's record.

## What it is not told

The agent is not told where the assembly, the record, or its gate lives, which
provider or model is running it, its timeout or retry budget, or how many
repeats of a loop remain
([what the agent is not told](/specification/running/#what-the-agent-is-not-told)).

## The world it sees

What the agent is told instead is its slots, as environment variables and as
names in its prompt: `$PWD`, `$INPUT`, `$OUTPUT` (when the stage writes one),
`$TMP`, `$SKILLS`, `$SUBFLOWS` when it has helpers, and any input slots the
invocation supplied — each with one line saying what it is for
([slots and skills](/specification/slots-and-skills/)). Skills and subflows are
announced by name and one-line purpose, with the rest read on demand; the
prompt tells the agent what exists and where it starts, and nothing more.
