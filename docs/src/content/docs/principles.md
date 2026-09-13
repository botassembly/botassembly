---
title: "Principles"
description: "Why the format is shaped the way it is: the functional core, and the principles every design decision answers to."
sidebar:
  order: 3
---

Everything in this documentation follows from a small functional core and a handful of principles. If a design decision in the specification ever seems arbitrary, one of these is usually the reason.

## The functional core

An assembly is a folder of plain markdown and executable scripts. The runtime walks the folder in order; at each stage it gives an agent the stage's instructions, runs your scripts before and after, judges the output with deterministic checks, and writes down what happened. That is the whole job: **a folder in, a record out.** Everything else — control flow, skills, slots, intelligences — is vocabulary inside that folder.

## Understandable

As agents get more capable, the risk is that the humans responsible for the work stop understanding what the agent is doing and why. An assembly is written in plain English on purpose: the instructions, the checklist, the gate's review criteria, and the record of what ran are all prose and files a person can read without the runtime installed. The checklist carries the checklist-manifesto idea into agent work — a written affirmation, item by item, that the agent did everything the author said mattered, visible afterward to anyone who asks.

## Durable

The files outlive the program. An assembly lives in git, reviews as a diff, and still says exactly what the work was after the runtime that executed it is gone. That is why the record is JSONL instead of an API, configuration is frontmatter instead of a console, and nothing an assembly does is expressed anywhere a reader cannot see.

## Constrained, not hoped

The agent is the only non-deterministic part, and it is fenced by deterministic machinery on every side: a `before` script prepares the world, the checklist, schema, and gate judge the output in a fixed order, and `success` or `failure` runs on the way out. Skills can carry scripts too, so even the capabilities an agent reaches for can be deterministic tools rather than improvisation. Wherever a step *can* be a script, it should be a script; the agent is spent only on the part that genuinely needs judgment.

## A Unix command with a non-deterministic core

A stage is a pipeline step: it reads its input, does one job, writes its output, and exits with a code that means what exit codes mean everywhere. A flow is a pipeline of such steps — one procedure, end to end. Assemblies compose the way commands compose, and follow POSIX manners: honest exit codes, files as the interface, no hidden state. The only thing unusual about this command is that its middle is an agent.

## Placement is the graph

Control flow is not configured — it is drawn with folders. Stages run in the order they sort; a `choose` node lets the agent pick one branch; a `parallel` node fans work out and joins it; nesting a flow inside another descends into it; and a flow that names itself recurses, bounded by an explicit depth. There is no workflow language to learn and no engine file to keep in sync with the folders, because the folders *are* the definition: to read the [graph](/specification/graph/), list the directory; to change it, move a folder. Anything a workflow engine expresses with a DAG file, an assembly expresses with placement — and the diff that reviews the change is a rename.

## One stage, one context window

A stage is sized so an agent can finish it in a single context window — no compaction, no carrying a degraded, overlong conversation. This is a balance struck deliberately: prompts are constructed with stable prefixes so context caching keeps repeated runs and send-backs cheap — every token the window does spend is made to count — while the window stays small enough that the agent never operates in the long tail where models degrade. When a piece of work would blow the window, it becomes a [subflow](/specification/graph/) — a procedure that runs in someone else's context and comes back with an answer, spending none of the calling stage's attention. A subflow is also where the model is chosen: the hard piece can go to a smarter model and the routine piece to a cheaper one, so judgment is bought only where the work needs it — and either way the calling stage's context is protected.

## Progressive disclosure

An agent is told what exists — skills, subflows, inputs — by name and one line, and reads the rest only when it deliberately reaches for it. [Skills](/specification/slots-and-skills/) are the horizontal axis: reusable capabilities and preferences — how to build a spreadsheet, a house style, a palette — shared across an assembly, a flow, or pinned to a single stage on purpose. Flows are the vertical axis: one procedure, start to finish. Keeping those orthogonal is what lets a capability be written once and recruited anywhere without any flow knowing how it works.

## Focused, not sandboxed

[Slots](/specification/slots-and-skills/) tell the agent where to find its input, output, scratch space, and working directory. `bot` is not a sandbox. Direct file tools can use absolute paths, and commands, hooks, gates, and subprocesses use the operator's filesystem and network authority. A stage `access` declaration can refuse direct model-facing calls. It does not contain an allowed process. The record retains calls reported by the model harness and the calls `bot` denied. It does not watch the filesystem or list every side effect. Use operating-system or container containment before running an untrusted assembly or model.

## The record is an asset

A sealed run is not exhaust to be rotated away — it is structured data: what was asked, what each stage was told, what judged the work, what it cost. Records accumulate into the history of how an assembly actually behaves, and because they are plain files, anything can read them: a person auditing one run, a script comparing a hundred, a diff between how this month's model and last month's handled the same request. Design decisions that look strict — sealing, byte-faithful capture, honest causes — exist so that this data can be trusted later.

## An assembly is a package

A workflow you build is an artifact you can hand to someone: `bot assembly install` takes a git URL or a folder, and the whole workflow — instructions, checks, hooks, skills — arrives as the reviewable files it always was. There is no export step and no application the workflow is entangled with. Teams share assemblies the way they share code, because assemblies are code's oldest form: files in a folder under version control.

## State lives in the files

A run starts fresh on purpose — no hidden memory, no accumulating intelligence of past runs. What persists is what you can see: the working directory the run was pointed at, the outputs it sealed, the record it left. If an assembly needs to remember something between runs, that memory is a file in the working directory or in git, where a reader can find it, diff it, and delete it. Anything the agent knows, you can know.

## Model- and provider-agnostic

Stages name what kind of intelligence they need, not a vendor's version string. An intelligence is a semantic name resolved at run time, so upgrading a model is one edit at the assembly or home level — never a sweep through every stage of every flow. The same separation runs all the way down: the [specification](/specification/overview/) defines files on disk and never a particular program, and any runtime that accepts and refuses the [conformance corpus](/specification/conformance/) correctly is a conforming implementation.

## Honest endings

A malformed assembly is refused before any model is called, with a named reason from a fixed [vocabulary](/specification/refusals/) — never guessed around. A run that ends tells you its true cause. Ambiguity is treated as an error at the boundary so it can never become an error in the middle of paid, non-deterministic work.
