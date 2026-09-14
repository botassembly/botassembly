---
title: "Before you pilot it"
description: "The authority an assembly gets, what its agent can reach, and what is bounded and what is not."
---

`bot` hands an assembly the authority of the person who ran it. Know what that means before you point it at real work.

## Four things to know

**Not a sandbox.** Commands, hooks, gates, and subprocesses use your filesystem and network authority. Contain an untrusted folder with the operating system or a container.

**No run-wide budget.** A stage carries a timeout and concurrency has a width. Nothing bounds a run as a whole: no deadline, no cost budget, no disk cap.

**Pre-1.0.** Assembly and record contracts may change without migrations before 1.0. Version 1.0 is the first promised compatibility boundary.

**Unix runtime.** Linux and macOS with Node 22.22 or newer are the native platforms. Windows runs through WSL. Native Windows refuses every command.

## What is not restrained

Every stage's agent receives read, write, edit, and shell tools. Direct file tools accept absolute paths. Commands, their configuration and aliases, anything they spawn, hooks, and gates run with the operator's filesystem and network authority.

The record retains the direct tool calls the model harness reported. It does not watch the filesystem and it does not claim a complete list of changes.

Supply your own operating-system or container containment before running an assembly or a model you did not write.

`--in DIR` sets the root directory where the run starts work, and it defaults to your current directory. Use a worktree or another intended directory when you do not want the current directory used. Absolute paths outside that working directory remain reachable when the operating system permits access.

## What the agent is given

The agent runs in the Pi agent library, pinned and bundled with `bot`. `bot` never re-implements the model session, the tool loop, or token accounting. It hands the library a system prompt, a model, and a tool list, and taps the events the library reports into the record.

Every stage, every attempt, gets four file-and-shell tools: `read`, `write`, `edit`, and `bash`. They are Pi's own tool implementations, wrapped so that paths behave the way slots promise.

- A path written as `$INPUT/read.txt` or `$OUTPUT` is expanded to its real location before the tool touches the disk. The agent addresses files by slot name, and the tool echoes the slot name back.
- The shell a `bash` call gets holds exactly the environment `bot` composed for the stage. The slots are real variables. Credential-shaped variables and `BOT_HOME` are scrubbed. Inheritance from `bot`'s own process is turned off.
- Temporary files land under the stage's `$TMP`. `TMPDIR` points there too. That directory is scratch, kept for debugging and removed with the run.
- A path starting with `~` is refused with a sentence asking for the path in full. That is a guardrail against addressing your files by shorthand, not containment. Absolute paths still reach anywhere.

The format's five control tools are `mark`, `refuse`, `continue`, `select`, and `subflow`. `subflow` is wired only when the stage has subflows in scope. A working stage sees `refuse`, plus `mark` only when it has a checklist. The agent of a branch sees `refuse` and `select`. `continue` appears only after the work has passed every check, when a loop's question is finally asked. Every call is recorded with its decision and its evidence.

## What the agent is not told

The agent is not told where the assembly, the record, or its gate lives. It is not told which provider or model is running it, its timeout or retry budget, or how many repeats of a loop remain.

What it is told instead is its slots, as environment variables and as names in its prompt, each with one line saying what it is for. Skills and subflows are announced by name and one-line purpose, with the rest read on demand.

## Credentials stay separate

Credentials come from your environment or from Pi's authentication store. They never come from a folder you installed, and nothing in an assembly can read them out of the stage environment.

## What is bounded

| Bound | Where it is set | What it covers |
| --- | --- | --- |
| `timeout` | the option ladder | one stage's agent, and each gate and hook |
| `retries` | the option ladder | send-backs before a stage is spent |
| `repeat` | `LOOP.md` | repeats before a loop is spent |
| `width` | `PARALLEL.md` and `FANOUT.md` | branches at once, at most 32 |
| `max-depth` | `DESCEND.md` | consecutive self-call depth, an integer from 1 through 11 |
| 10 child calls | the runtime | one mixed-flow call chain after its root flow |
| 4 MiB | the runtime | one fresh or resumed request |

Where each key resolves, and its defaults, is [options and where they resolve](/specification/running/#options-and-where-they-resolve).

## What is not bounded

No deadline, no cost budget, no disk quota. `timeout` bounds a stage's agent, and each gate and hook gets a budget of the same size. The run itself ends when its stages do. Supervising a long or expensive one is yours to do from outside.

This matters before unattended or batch work. A flow with a loop, a fan-out, or a large input can spend more than you meant it to, and `bot` will not stop it.

A sealed record carries each turn's token split, and `bot run list` sums the verified totals. That is after the fact. It imposes no cap.

The design argument behind all of this is [focused, not sandboxed](/understand/principles/#focused-not-sandboxed).
