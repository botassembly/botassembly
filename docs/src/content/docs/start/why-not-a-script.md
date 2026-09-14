---
title: "Why not a script"
description: "What an assembly gives you that a shell script, a graph library, or a folder of prompts does not, and what work it suits."
---

You could write a script instead. Here is what an assembly gives you that a script does not.

An assembly is a folder of markdown files that tells agents what to do, stage by stage. A stage is one file. It holds the instructions for one agent and the tests that judge its answer. The runtime reads the folder, runs each stage in order, and writes down what happened.

## Why not write a script?

A script can do the same work. An assembly standardizes the execution contracts you would otherwise invent for each script: stage ordering, input and output handoffs, acceptance checks, retry behavior, and retained evidence.

Use a script for a one-off. Use an assembly when the procedure has to be reviewed, reused, checked, and diagnosed again and again.

## How does it differ from a graph library like LangGraph?

A graph library gives an application programmable orchestration. It offers persistence, streaming, and lifecycle control in code.

Here the directory structure is the graph. Stage results move through files. There is no engine file to keep in step with the folders, because the folders are the definition.

Choose a graph library when agent state and interruptions need programmatic control. Choose an assembly when you want a repeatable procedure your team inspects and maintains as a folder.

## How does it differ from a folder of prompts?

A folder of prompts holds the instructions and nothing else. It does not say what order they run in, what each one receives, or whether the answer was any good.

An assembly holds the instructions, the order, the handoffs, and the tests. Every one of those is a file you can open, diff, and rewrite.

## What work does it suit?

Bounded jobs with inspectable intermediate artifacts and real acceptance criteria. Document extraction, research synthesis, code migrations, repository review, report production.

It suits a trivial single-call task poorly. It is the wrong central coordinator for a complex customer-facing service.

## How far along is it?

One runtime implements the format. It is called `bot`. The format is written down as a specification, and 143 conformance cases judge an implementation against it. Four example assemblies ship in the repository and every check runs them.

Assembly and record contracts may change before 1.0 without a migration. Version 1.0 is the first promised compatibility boundary. No date is set for it.

Next: [install `bot`](/start/install/) and prove it works without calling a model.
