---
title: "The format and the runtime"
description: "A folder contract with a versioned specification and a conformance corpus, and bot, the one program that implements it."
---

Two separate things carry the same name, and telling them apart explains most of the design.

The **format** is a folder contract. It says what files an assembly may hold, what a stage's frontmatter means, how folder placement becomes control flow, what a run must write down, and what a malformed assembly must be refused for. It is plain text on disk. It names no program.

The **runtime** is `bot`. It is one implementation that reads such a folder and runs it. It has a command line, a home directory, credentials, providers, and a version of Node it needs.

## The format

The specification is the format written down, one document per element. It is published as [the specification pages](/specification/overview/) and as markdown in the repository.

Beside it sits the conformance corpus: 143 cases. Each case is a whole invocation, holding a home, an assembly, the command line, and the exact output expected. 35 must be accepted. 108 must be refused, each for a named reason from a fixed vocabulary.

Every change to `bot` or to the specification runs against all 143 cases. That is how this project keeps the runtime honest against its own contract. It is also the door left open for a second implementation. None exists yet.

The corpus calls no model, so passing it proves static behavior only. The format's invariants govern what a live run does, and [conformance](/specification/conformance/) states both claims separately.

## The runtime

`bot` resolves intelligences to real models, calls providers, holds your credentials, seals a record to disk, and answers questions about what it ran. None of that is the format's law.

## Where they meet

`bot assembly check` is the seam. It reads an assembly, refuses it if the format says it is malformed, and otherwise prints every statically reachable flow definition and node, 20 rows to a page. Each node carries its resolved options and the file each value came from. It calls no model and spends no money.

```sh
bot assembly check ./triage/triage
```

That is exactly what the 143 corpus cases run. The command you use to confirm your own folder is the command the corpus uses to judge a runtime. When `bot assembly check` refuses your assembly, the format is refusing it, in the format's vocabulary, and any conforming runtime would refuse it the same way.

## What changes, and how

**The format changes slowly and visibly.** A change to it is a change to the specification documents and, where it is testable, to the corpus. Before 1.0, assembly and record contracts may change without migrations. Version 1.0 is the first promised compatibility boundary.

**The runtime changes on its own schedule.** New commands, new providers, better output, bug fixes. A runtime change that is not also a specification change cannot alter what a conforming assembly means.

If `bot` and the specification ever disagree, the specification is right and `bot` has a bug.

## Next

- Writing a folder: [stages and checks](/build/stages-and-checks/), then [structure](/specification/structure/) and [the graph](/specification/graph/) for the law behind it.
- Running one: [run the shipped example](/start/run-the-example/), then the [command reference](/reference/commands/).
- Checking an implementation: [conformance](/specification/conformance/).
- Why it is shaped this way: [principles](/understand/principles/).
