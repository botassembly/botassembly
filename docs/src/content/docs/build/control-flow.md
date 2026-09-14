---
title: "Control flow"
description: "Folders are the graph: how CHOOSE, PARALLEL, LOOP, FANOUT, and subflows are drawn with directories."
---

Branches, loops, and fan-out are drawn with folders.

There is no workflow language and no engine file. Stages run in the order their names sort. To read the shape of a flow, list the directory. To change it, move a folder.

## The three containers

Fixed control flow lives in a folder holding one capitalized markdown file. That file is what makes the folder a container.

`CHOOSE.md` names the alternatives in its body. A chooser agent picks exactly one branch, and its reason is recorded. Each subfolder beside it is one alternative.

`PARALLEL.md` runs every branch with the same input. The next stage receives every branch's output side by side.

`LOOP.md` repeats its branch. Each repeat receives the loop's input plus the previous repeat's output.

This is the branch in `examples/triage`.

```text
02-route/
  CHOOSE.md
  urgent/01-urgent.md
  routine/01-routine.md
```

Containers nest, with two exceptions. A loop anywhere inside a loop is refused, however many folders sit between them. A branch or alternative may not itself directly be a parallel.

Containers are for control flow you know while authoring.

## Fan-out

A fourth file handles the case the three containers cannot: one piece of work per item of a list whose length nobody knows until the run produces it.

`FANOUT.md` runs one authored subflow for every item in a checked JSON list. The stage before it produces the list. The producing agent never calls the subflow itself.

This is `examples/brief`, which summarizes every note in a week of team notes.

```yaml title="flows/brief/02-summarize/FANOUT.md"
items: notes
subflow: summarize
width: 3
max-items: 3
```

The file has no body and exactly those four keys. `items` names a top-level array in the preceding stage's JSON output. `subflow` names an in-scope subflow whose final node is an ordinary stage. `width` limits how many children run at once. The bounds are `1 <= width <= max-items <= 32`.

Each array entry has exactly `id` and `input`. Items are sorted by the bytes of their ids. A fan-out succeeds only when every child succeeds. It never hands a partial set to the next stage.

`FANOUT.md` is provisional and may change before 1.0. Where the folder may sit, and what may sit beside it, is [fan-out](/specification/graph/#fanoutmd).

## Subflows

A subflow is a procedure that runs in its own context and comes back with an answer. It spends none of the calling stage's attention.

A `subflows/` folder holds them. A subflow scoped to a flow sits under that flow. A subflow scoped to one stage sits under that stage.

An agent calls a subflow with a tool. A `FANOUT.md` calls one per item. `DESCEND.md` marks a flow that calls itself, bounded by an explicit `max-depth` from 1 through 11.

`examples/outline` uses `DESCEND` to expand a report section by section. `examples/brief` puts all three containers in one flow next to a fan-out. Each one carries a `README.md` saying why its containers sit where they do.

## What check tells you

`bot assembly check` reports each statically reachable flow definition and node once. It preserves the order you authored. It predicts no dynamic choice, repeat, call, or item count.

A `CHOOSE` lists every alternative, because any of them could run. A `LOOP` lists its contents once, because how many repeats there will be is not knowable without running. A fan-out row keeps its authored width and maximum without claiming how many items a run will contain.

A node whose arriving files are not always the same carries two input fields. `input` holds one set that arrives together, and `possible_inputs` holds the union of every set that could arrive. A node after a `CHOOSE` is one such node, and so is a node whose input differs across depth states. A `PARALLEL` keeps every branch file in `input`, because they do all arrive.

The rows come 20 at a time. A larger flow is paged rather than truncated, and `bot` says so on standard error. [Command reference](/reference/commands/) holds the page sizes.

The whole law of the graph is [the graph](/specification/graph/).

## Next

[Skills and slots](/build/skills-and-slots/) covers what an agent is told exists and what it reads on demand.
