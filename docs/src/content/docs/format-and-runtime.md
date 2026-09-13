---
title: "The format and the runtime"
description: "Two things share this site: a folder format with a versioned specification and a conformance corpus, and bot, the runtime that executes it."
---

This site documents two things. Tell them apart and the rest reads straight.

The **format** is a folder contract. It says what files an assembly may hold, what a stage's frontmatter means, how folder placement becomes control flow, what a run must write down, and what a malformed assembly must be refused for. It is plain text on disk. It names no program.

The **runtime** is `bot`: one implementation that reads such a folder and runs it. It has a command line, a home directory, credentials, providers, and a version of Node it needs.

## The format

The specification is the format written down, one document per element, published as [the Format pages](/specification/overview/) on this site and as markdown in the repository. It carries a version. `0.0.1` is the first public alpha, and individual changes do not bump a counter of their own.

Beside it sits the conformance corpus: 143 cases. Each case is a whole invocation: a home, an assembly, the command line, and the exact output expected. 35 must be accepted. 108 must be refused, each for a named reason from a fixed vocabulary. The corpus is how this project keeps `bot` honest against its own specification, and every change to either one is run against all 143 cases. It is also the door left open for a second implementation. None exists yet.

Passing the corpus is not the whole claim. Static corpus passage does not imply invariant compliance, because the corpus calls no model and the invariants govern what a live run does; [Conformance](/specification/conformance/) states both claims.

That is the point of keeping the two apart. An assembly is markdown and scripts in git, and it still says what the work was after the program that ran it is gone.

## The runtime

`bot` is the implementation shipped here. It resolves intelligences to real models, calls providers, holds your credentials, seals a record to disk, and answers questions about what it ran. Everything under [Runtime](/reference/invocation/) on this site is the surface of `bot`, not the format's law. Each of those pages says so at the top.

## Where they meet

`bot assembly check` is the seam. It reads an assembly, refuses it if the format says it is malformed, and otherwise prints every stage in the order it would run with every option resolved and the rung each value came from. It calls no model and spends no money.

```sh
bot assembly check ./reading-list/digest
```

That is exactly what the 143 corpus cases run. The command you use to confirm your own folder is the command the corpus uses to judge a runtime. When `bot assembly check` refuses your assembly, it is the format refusing it, in the format's vocabulary, and any conforming runtime would refuse it the same way.

## What changes, and how

**The format changes slowly and visibly.** A change to it is a change to the specification documents and, where it is testable, to the corpus. The version is the specification's version. Before 1.0, assembly and record contracts may change without migrations; 1.0 is the first promised compatibility boundary.

**The runtime changes on its own schedule.** New commands, new providers, better output, bug fixes. A runtime change that is not also a specification change cannot alter what a conforming assembly means. If `bot` and the specification ever disagree, the specification is right and `bot` has a bug.

A release states which specification version its runtime implements. Claiming conformance to 0.0.1 claims nothing about a later publication.

## Read next

Open `examples/triage` in the repository next. It is the assembly the home page's record came from, it runs, and it is the one this documentation keeps coming back to: a skill, a checklist, a schema, a chooser, two gates, and three hooks in one small flow. From `examples/`, run `bot assembly check ./triage/triage` and read the resolved stages before you change anything.

- Writing a folder: [Authoring an assembly](/guides/authoring-assemblies/), then [Structure](/specification/structure/) and [The Graph](/specification/graph/) for the law behind it.
- Running one: [Operating runs](/guides/install-and-use/), then [Invoking a run](/reference/invocation/).
- Checking an implementation: [Conformance](/specification/conformance/).
- Why it is shaped this way: [Principles](/principles/).
