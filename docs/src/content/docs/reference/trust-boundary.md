---
title: "Trust boundary"
description: "What bot restrains and what it does not: the access declaration, what it can refuse, and why an untrusted assembly needs containment of your own."
sidebar:
  order: 8
---

*This page describes the authority the `bot` runtime hands an assembly and the authority it withholds — an implementation reference, not part of the runtime-agnostic format specification.*

**`bot` is not a sandbox.** Read this before running an assembly you did not write.

## What bot does not restrain

Once a command is allowed, bot does not restrain it. Its configuration, its aliases, and anything it spawns run with your full authority. Without an `access` declaration, the model receives read, write, edit, and Bash tools. Direct file tools accept absolute paths. A declared access policy can refuse direct model-facing calls at bot's dispatch by managed slot or executable name. Allowed commands, hooks, and gates retain the operator's filesystem and network authority. The record retains direct tool calls reported by the model harness and the direct calls bot denied. It does not watch the filesystem or claim a complete list of changes. Supply your own operating-system or container containment before running an untrusted assembly or model.

`--in DIR` sets the root directory where the run starts work, and it defaults to your current directory. Use a worktree or another intended directory when you do not want the current directory used. Absolute paths outside that root remain reachable when the operating system permits access.

## What it does control

A stage `access` declaration is the one lever the format gives you, and it works at bot's dispatch: it can refuse a direct model-facing call by managed slot or by executable name. The declaration is [`access`](/specification/structure/#the-stage) in the specification; what the agent is handed when nothing is declared is [What the agent can do](/reference/agent-tools/).

Credentials are separate from the assembly. They come from your environment or Pi's supported authentication store, never from a folder you installed. See [Authentication](/reference/auth/).

## Where to read more

- [Focused, not sandboxed](/principles/#focused-not-sandboxed) — the design argument.
- [What the agent can do](/reference/agent-tools/) — the tools and reach a stage's agent actually has.
- [Limits and cost](/reference/limits/) — what bounds a run, and what does not.
