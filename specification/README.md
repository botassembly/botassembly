# The Bot Assembly specification

[Changelog](CHANGELOG.md) — what changed here, and why.

An assembly is a folder. A runtime executes it. Everything below is one element
of that format, in one document.

## File over app

This format is built on one bet, borrowed from the essay of that name: **the
files outlive the program.** An assembly is markdown and scripts a person can
read in any editor, carry in git, and understand without the runtime existing —
the folder is the program, and the app is just the thing that runs it today.
That is why placement is the graph instead of a workflow engine's database, why
the record is JSONL instead of an API, why configuration is frontmatter instead
of a console, and why nothing an assembly does is expressed anywhere a reader
cannot see. It is an anti-framework: when this runtime is gone, the folders
still say exactly what the work was.

Its running mate is **progressive disclosure**: an agent is told what exists —
skills, subflows, inputs, by name and one line — and reads the rest only when
it deliberately reaches for it ([prompt construction](elements/prompt.md),
[skills](elements/skills.md)).

Start with [the worked example](example.md), which shows the parts assembled.
[The invariants](elements/invariants.md) hold everywhere and are the law
beneath it; [the witness ledger](elements/invariants-witnesses.md) names, for
each one, what in this repository would fail if a runtime stopped honoring it.

## Version and compatibility

Version `0.0.1` is the first public alpha. The runtime, specification, and examples match within that release. Individual tickets do not bump a shared version or counter. A later pre-1.0 release may change assembly and record contracts without migration. Early alpha users may need to update assemblies and may need the matching older runtime to read an older record. Version 1.0 is the first promised cross-version compatibility boundary.

Stability labels distinguish settled and provisional requirements inside the current publication. A runtime's conformance claim names the publication version it implements. Claiming conformance to 0.0.1 does not itself claim conformance to a later pre-1.0 publication or to 1.0.

## The shape of an assembly

| Document                          | What it covers                                 |
| --------------------------------- | ---------------------------------------------- |
| [stage](elements/stage.md)        | one step: input, agent loop, checks, output    |
| [flow](elements/flow.md)          | a numbered folder of stages                    |
| [assembly](elements/assembly.md)  | the folder that holds the flows                |
| [home](elements/home.md)          | where assemblies and runs live                 |
| [slots](elements/slots.md)        | `$INPUT`, `$OUTPUT`, `$TMP`, `$SKILLS`, `$SUBFLOWS`, `$PWD` |
| [skills](elements/skills.md)      | capabilities, and progressive disclosure       |

## Gating

| Document                            | What it covers                          |
| ----------------------------------- | --------------------------------------- |
| [gating](elements/gates.md)         | the three checks and what a failure does |
| [checklist](elements/checklist.md)  | what the agent affirms before it leaves  |
| [schema](elements/schema.md)        | what the output has to be                |
| [gate](elements/gate.md)            | whether the work is good enough          |
| [hooks](elements/hooks.md)          | `before`, `success`, `failure`           |

## Arranging stages

| Document                          | What it covers                        |
| --------------------------------- | ------------------------------------- |
| [graph](elements/graph.md)        | placement is the graph; the sentinels |
| [loop](elements/loop.md)          | `LOOP.md`                             |
| [choose](elements/choose.md)      | `CHOOSE.md`                           |
| [parallel](elements/parallel.md)  | `PARALLEL.md`                         |
| [fan-out](elements/fanout.md)     | `FANOUT.md`                           |
| [subflow](elements/subflow.md)    | flows a stage can call                |
| [descend](elements/descend.md)    | `DESCEND.md` — a flow that calls itself |

## Running one

| Document                             | What it covers                             |
| ------------------------------------ | ------------------------------------------ |
| [runtime](elements/runtime.md)       | the contract every runtime meets           |
| [refusals](elements/refusals.md)     | how a malformed assembly is reported       |
| [invocation](elements/invocation.md) | how a run starts and how options resolve   |
| [prompt](elements/prompt.md)         | what the agent is told, and what it is not |
| [auth](elements/auth.md)             | the credentials a run calls a model with   |

## Reading one afterward

| Document                             | What it covers                       |
| ------------------------------------ | ------------------------------------ |
| [record](elements/record.md)         | what a run writes down               |
| [session](elements/session.md)       | the transcript of one stage          |
| [inspection](elements/inspection.md) | the commands for reading both        |
| [management](elements/management.md) | the commands for what the home holds |
| [conformance](conformance.md)        | the corpus a runtime is checked against |
