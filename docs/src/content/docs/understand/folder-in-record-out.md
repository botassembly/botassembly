---
title: "A folder in, a record out"
description: "The whole bet in one sentence: the procedure is a folder of plain files, and what happened is a record on disk."
---

The whole runtime is one sentence. A folder goes in. A record comes out.

An assembly is a folder of markdown and executable scripts. The runtime walks it in order, gives each stage to an agent, runs the checks you wrote, and writes down what happened. Stages, skills, branches, gates, and intelligences are all vocabulary inside that folder.

## The folder owns the behavior

Every instruction is a file. Every checklist item is a line in a file. Every gate is a script you can run by hand.

Nothing about the procedure lives anywhere a reader cannot get at it. There is no service holding the real definition, no database row, no console with the settings in it. Installing is a clone and a launcher on your `PATH`.

Why not a configuration file that names the steps? Because then two things describe the flow and one of them drifts. Stages run in the order their names sort. Reordering the flow is `mv`.

## The record owns the history

Each run writes an ordered `record.jsonl` inside its own directory. The events name stage starts and endings, checklist decisions, checks, branch choices, token usage, and the final exit. File digests connect the retained artifacts and the executable checks to the event that referred to them.

The record never says what should have happened. It says what did.

## Neither half needs the other

You can rewrite a gate without touching a single record. You can read a record from a folder you deleted a year ago.

That separation is the reason the record is JSONL instead of an API, and the reason configuration is frontmatter instead of a console.

## What that buys

**Review is a diff.** A change to how an agent is judged is a change to a shell script. It arrives in a pull request the way a change to a function does.

**Handing it over is `git clone`.** `bot assembly install` takes a git URL. There is no export step, because there was never an import step.

**Reading a finished run needs no provider.** The commands render the record and verify its structure. Nothing calls out.

**A hundred runs are data.** Records accumulate into the history of how an assembly actually behaves. A script can compare them. A diff can show how this month's model and last month's handled the same request.

## One honest limit

The record is not containment. `bot` keeps the calls the model harness reports. It does not watch the filesystem, and a gate script runs with whatever authority you have. Put a container around an assembly you did not write.

Run records and provider sessions stay on the machine that made them. A request, a response, a tool result, or an inherited value can carry sensitive material.

## Next

[The format and the runtime](/understand/format-and-runtime/) separates the folder contract from the program that reads it. [Principles](/understand/principles/) gives the arguments behind each design decision.
