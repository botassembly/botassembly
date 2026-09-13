---
title: A folder in, a record out
description: The whole runtime is one sentence. Here is the folder that goes in and the local record contract that comes out.
date: 2026-09-11T12:00:00Z
authors: ian
tags:
  - principles
draft: true
excerpt: An assembly is a folder of markdown and scripts. A run of it leaves a local record. Everything else is vocabulary inside the folder.
---

An assembly is a folder of markdown and scripts. The runtime walks the folder in order, gives each stage to an agent, runs the checks you wrote, and writes down what happened. That is the whole job: a folder in, a record out. Stages, skills, choosers, gates, intelligences are all vocabulary inside the folder.

The runnable folder ships in the repository. Records from provider runs stay local because they can contain sensitive material.

## The folder

```console
$ ls -R examples/triage
examples/triage:
ASSEMBLY.md  flows  README.md  skills

examples/triage/flows/triage:
01-classify  02-route  03-verify  FLOW.md

examples/triage/flows/triage/01-classify:
before  failure  schema.json  STAGE.md  success

examples/triage/flows/triage/02-route:
CHOOSE.md  routine  urgent

examples/triage/flows/triage/03-verify:
gate  STAGE.md

examples/triage/flows/triage/03-verify/gate:
01-blocker  02-sections
```

I trimmed the leaf files out of that listing. Nothing else is hiding.

`triage` sorts an inbound customer request into an urgent queue or a routine one and writes the routing memo. `01-classify` reads a priority rubric and writes JSON. `02-route` picks a branch. The branches are the `urgent/` and `routine/` directories sitting right there. `03-verify` writes the memo. Two shell scripts under `gate/` decide whether the memo is acceptable. `STAGE.md` carries a checklist the agent affirms item by item. Atul Gawande wrote that idea down for surgeons and I moved it onto agent work.

Why not a YAML file that names the steps? Because then two things describe the flow and one of them drifts. The stages run in the order their names sort. Reordering the flow is `mv`.

## The record

Each run writes an ordered `record.jsonl` inside its local run folder. The events name stage starts and endings, checklist decisions, checks, branch choices, usage, and the final exit. File digests connect retained artifacts and executable checks to the event that referred to them. Use `bot run events RUN` for the supported reading.

The website walkthrough uses a clearly labeled synthetic illustration to show this shape. It does not present the values as measured behavior. This repository does not publish provider-produced records or sessions.

## What each side owns

The folder owns the behavior. Every instruction, every checklist item, every gate script is a file you open and rewrite.

The record owns the history. It never says what should have happened. It says what did.

Neither half needs the other. I can rewrite a gate without touching a single record, and I can read a record from a folder I deleted a year ago.

## What that buys

Review is a diff. A change to how the agent is judged is a change to a shell script. It arrives in a pull request the way a change to a function does.

Handing it to a teammate is `git clone`. `bot assembly install` takes a git URL. There is no export step, because there was never an import step.

Reading a retained run needs no provider connection. The supported Bot commands render the record and verify its structure before using it.

## One honest limit

The record is not containment. Bot keeps the calls the model harness reports and the calls Bot itself denied. It does not watch the filesystem, and a gate script runs with whatever authority you have. Put a container around an assembly you did not write. That is the easiest lie to tell in this category and I am not going to tell it.

The repository does not publish provider records, raw provider sessions, or complete run folders. A request, response, tool result, or inherited value can carry sensitive material.

## Next

The next post will explain how to inspect a local run without publishing its contents.
