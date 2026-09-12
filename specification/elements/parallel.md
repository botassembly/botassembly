# `PARALLEL.md`

> **Stability: stable.**

A parallel stage runs several branches at once.

```text
02-assess/
  PARALLEL.md
  research/
    01-gather.md
    02-summarize.md
  risk/
    STAGE.md
    schema.json
  cost.md
```

Branches are named, not numbered. They do not run in sequence, so a number would
be a lie about them. A branch is a single stage file, a stage folder, or a
folder holding numbered stages that run in order — `risk/` above is a stage
folder, typed by its `STAGE.md`.

`PARALLEL.md` has one key of its own, `width`, and no body. Nothing is asked of
an agent here.

## Every branch gets the same input

The parallel stage's input is handed to each branch unchanged. Branches do not
see each other's inputs, outputs, or scratch. They do share the working tree —
`$PWD` is one tree ([slots](slots.md)) — and this specification does not
pretend otherwise: branches that would fight over the same files are the
author's to separate.

## Nothing is merged

Each branch writes its own `$OUTPUT`, and the stage after the parallel stage
receives all of them as named files in its `$INPUT` ([slots](slots.md)):

```text
$INPUT/research.txt
$INPUT/risk.json
$INPUT/cost.txt
```

There is no merge rule because there is no merge. The filesystem is the
namespace, the branch name is the key, and three branches producing three
different formats is not a problem to be solved — markdown next to JSON next to
a PNG all work, because nothing is trying to combine them.

The stage that follows addresses each branch by name. Its prompt is told the
names, so it does not have to discover them
([prompt construction](prompt.md)).

An author who does want one file writes a stage that reads the three and writes
one. That is an ordinary stage doing an ordinary thing, and the format needs no
opinion about it.

## Width

```yaml
width: 3
```

How many branches run at once. All of them, unless this says otherwise. When
`width` holds some branches back, branches start in name order
([invariant 41](invariants.md)): a pool of `width` slots, the next name
starting when a slot frees. Which branches had started by the time one failed
is a fact of timing — a fast sibling frees a slot early — so the record says
which ran, per branch, rather than the format promising the same set on every
runtime. A runtime records how many ran concurrently, and the recorded order
of branches never implies the order they finished in.

`width` is at most 32, authored or defaulted; more is refused
([refusals](refusals.md)).

## When a branch fails

The parallel stage fails. Branches already running are allowed to finish first,
and their outputs are kept in the run even though nothing downstream reads them
([the record](record.md)).

When more than one branch failed, the exit code is the one from the first
failing branch in name order. Name order is chosen because it is the same before
the run as after it: completion order would make the exit code depend on
timing.

They are not cancelled because they are working in a shared tree
([`$PWD`](slots.md)), and an agent killed in the middle of a tool call leaves
that tree in a state nobody chose. Letting them land is cheaper than reasoning
about what half a branch did.

Branches that had not started do not start.
