# The control graph

> **Stability: stable.**

The graph is the folder tree. A stage's position decides when it runs, and
nothing else does.

There are no edge keys — nothing named `next`, `goto`, `on-pass`, or `on-fail`.
Nothing invokes a stage by name. A stage runs because the flow reached it.
Moving a folder changes the graph; editing frontmatter does not.

## The sentinels

A sentinel file names what the folder that holds it is, and sentinel names are
in capitals. Three of the sentinels type **containers** — `LOOP.md`,
`CHOOSE.md`, and `PARALLEL.md`; the others type a flow or a stage, which are
not containers ([stage types](stage.md#stage-types)).

A **sequence** is a folder of numbered entries that run in order and holds no
sentinel: a flow's contents, a branch of a `PARALLEL`, an alternative of a
`CHOOSE`. It is a sequence because of where it sits, not because of a file
inside it.

A container holding two sentinels, or a container's folder holding none where
one is required, is a malformed assembly.

| Sentinel      | What the folder is                                    |
| ------------- | ----------------------------------------------------- |
| `FLOW.md`     | a flow ([flow](flow.md))                              |
| `STAGE.md`    | a stage that runs once, in its numbered position ([stage](stage.md)) |
| `LOOP.md`     | a stage that repeats what is inside it ([loop](loop.md)) |
| `CHOOSE.md`   | a stage that runs one of several alternatives ([choose](choose.md)) |
| `PARALLEL.md` | a stage that runs branches at once ([parallel](parallel.md)) |
| `FANOUT.md`   | one subflow run for each checked list item ([fan-out](fanout.md)) |
| `DESCEND.md`  | a flow whose stages may call it again ([descend](descend.md)) |

A stage that needs no files of its own is a single markdown file, `01-name.md`,
and needs no sentinel to say what it is.

## Numbered and named

A numbered entry runs in sequence: `01-read.md` before `02-analyze/` before
`03-report.md`. Two entries sharing a number is an error.

A named entry does not run in sequence. The branches of a `PARALLEL` and the
alternatives of a `CHOOSE` are named rather than numbered, because a number
would be a lie about them.

The name — the part after the number, when there is one — is the entry's
identity. It appears in the record, and it is the filename the next stage finds
its input under.

## What every container shares

A container has an input, a position, an exit code, and its own frontmatter. It
has no hooks, no schema, no gate, and no checklist: those exist to judge an
output, and a container produces none of its own. To check what came out of a
container, write a stage after it.

A container's frontmatter sets the same keys a stage's does — every one of
them, `retries` included, except the stage-only `workdir`
([the stage](stage.md#the-prompt-and-the-configuration)) — and everything
inside it inherits them, so a `PARALLEL` can put its branches on a cheaper
model or a tighter retry budget
without repeating the key in each one ([invariant 31](invariants.md)). It sits
between the stage and the flow in the order things resolve
([invocation](invocation.md#options-and-where-they-resolve)).

A `CHOOSE` with a body runs an agent of its own, and `retries` bounds that
agent's send-backs the way it bounds any stage's. A `LOOP` with a body runs no
agent of its own: its question is put to the agent of its last stage
([loop](loop.md)), and the answer round spends that stage's `retries`.

A non-zero exit stops the flow whatever the type. What differs between types is
only which of their contents run, and how many times.

| Sentinel      | Its key  |
| ------------- | -------- |
| `LOOP.md`     | `repeat` |
| `PARALLEL.md` | `width`  |
| `CHOOSE.md`   | none of its own |

## How a container's work reaches the next stage

A container passes along what the stages inside it produced. The next stage's
`$INPUT` is a directory, so several outputs arrive as several named files and
nothing has to be combined ([slots](slots.md)).

| After a       | `$INPUT` holds                                       |
| ------------- | ---------------------------------------------------- |
| `STAGE`       | one file, named after the stage                      |
| `LOOP`        | one file, named after the loop, from the last stage of the last repeat |
| `CHOOSE`      | one file, named after the alternative that ran       |
| `PARALLEL`    | one file per branch, each named after its branch     |
| `FANOUT`      | one file per item, each named after its item id      |

`PARALLEL` and `FANOUT` can contribute more than one file. This is why `$INPUT` is a directory.

The filesystem is the namespace, so three branches producing three formats reach
the next stage intact. An author who wants them as one file writes a stage that
reads several and writes one, which is an ordinary stage doing an ordinary
thing.

## Where an agent gets a say

Almost nowhere. The graph is the author's, written in folders, and no agent can
change it. The exceptions are seven control tools, each a place where the format
wants a judgment a model makes better than a path expression: marking a
checklist item, refusing or reporting a fault for a stage, ending a loop,
selecting an alternative, calling a subflow the author placed in scope, and
confirming that this stage's temporary contents are disposable
([control tools](runtime.md#control-tools)).

## Nesting

Any container holds any container, to any depth, with two exceptions. A
branch or alternative that is directly a `PARALLEL` is refused
(`tail-container`): it is one name that would have to carry several outputs,
the tail rule below met in another position. A `LOOP` or a `CHOOSE` stands
anywhere a stage does except last — each passes along one output, but [the
tail below](#the-last-entry-of-a-sequence-is-a-stage) is a stage's alone — so
a branch of a `PARALLEL` can be a `LOOP`, and an alternative of a `CHOOSE`
can be another `CHOOSE`. And **a loop holds no loop** ([invariant 40](invariants.md)): a
`LOOP` inside a `LOOP`, however many containers sit between them, is refused —
`loop-nested`. Identity has one `repeat`, and a stage under two loops would
need two. Iteration inside iteration is a flow calling a flow: the stage in the
outer loop calls a subflow that loops, and each run's identity stays flat
([subflows](subflow.md)).

There is no depth limit. What a container does to its contents does not change
with depth — it has an input, it runs what is inside it, and it passes along
what they produced — so a limit would be a number with nothing behind it.

## The last entry of a sequence is a stage

Every sequence ends in a stage, never in a container.

This is what keeps the tail rules simple. A flow's output is its last stage's
output, so a flow ending in a `PARALLEL` would have several. A `LOOP`'s question
is put to the agent of its last stage, so a loop ending in a container would
have nobody to ask. An alternative passes along its last stage's output under
the alternative's name, so an alternative ending in a `PARALLEL` would have
several files and one name.

An author who wants a fan-out at the end writes the stage that reads it, which
is the stage that was going to have to exist anyway.

## What the tree may contain

Symbolic links anywhere in an assembly are refused and never followed, so the
folder a reader sees is the folder that runs.

Hidden dot-entries are ignored: they name nothing in the graph, they are not
hashed, and nothing in them is executed. An assembly kept in git carries its
`.git` directory without the format having an opinion about it. Anything an
assembly runs lives where a reader can see it.

`README.md` is permitted in any folder and is inert: it names nothing in the
graph, nothing in it runs, and nothing refuses it — documentation is welcome
everywhere. `LICENSE` is permitted at the assembly root, so an assembly can be
a repository somebody publishes.
