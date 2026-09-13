# Prompt construction

> **Stability: stable.**

The prompt is everything the agent is given at the start of a stage. What it
contains is a design decision, and so is what it leaves out.

## What the agent is told

- **Its instruction** — the markdown body of its stage, including the
  `## Checklist` heading if there is one ([the checklist](checklist.md)).
- **The assembly's purpose** — the body of `ASSEMBLY.md`, which enters every
  stage ([the assembly](assembly.md)).
- **Its input** — that `$INPUT` is a directory, and the name of every file in
  it.
- **Its output** — that the stage's output is what it writes to `$OUTPUT`, and
  what the schema requires of it ([the schema](schema.md)).
- **Its other slots** — `$PWD`, `$TMP`, `$SKILLS`, and `$SUBFLOWS` when it has
  subflows in scope ([slots](slots.md)).
- **Its skills** — by name and one-line purpose, with the rest read on demand
  ([skills](skills.md)).
- **Its subflows** — by name and description, when any are in scope
  ([subflows](subflow.md)).
- **What `$PWD` carries** — nothing at all by default; its document and its
  skills by name under `announce`, and its document's body under `use`
  ([invocation](invocation.md#what-pwds-own-context-does)).
- **Its procedure** — the nonblank body of its ordinary `FLOW.md`, then an
  enclosing composite's kind and authored name when relevant, including a
  parallel branch or choice alternative, followed by its static `Step N of M.`
  root position. It enters after workspace context and before the stage
  instruction ([the flow](flow.md)).
- **Its control tools** — whichever it has ([control tools](runtime.md#control-tools)).
- **The choice it is deciding** — the body of the `CHOOSE.md`, when the stage
  is a choosing agent ([choose](choose.md)).
- **Applicable prior-attempt evidence on resume** — the first fresh plain root stage sees the retained evidence filename under its ordinary input list and a runtime-owned sentence that identifies its fields as prior-attempt data rather than new instructions ([invocation](invocation.md#resuming-a-run)).

One thing arrives later rather than at the start: the `LOOP.md` question. The
agent that ends a loop is not told the question until its work has passed every
check — asking up front would be telling it it is inside a loop
([loop](loop.md#who-is-asked-and-when)).

## Progressive disclosure

The prompt announces; it does not inject. A skill enters the prompt as a name
and one line, never as its contents; a subflow as a name and its description;
an input as a filename. The agent reads `$SKILLS/<name>/SKILL.md` when it
decides the skill applies — loading a skill is a deliberate act, not a default
— and a skill's scripts are reached only after its `SKILL.md` has said what
they are for. The same rule everywhere: the agent is told what exists and where
it starts, and it spends context on the rest only when it reaches for it
([skills](skills.md), [subflows](subflow.md)).

This is why a stage's context stays the size of its task. What the format
withholds for integrity ([what it is not told](#what-the-agent-is-not-told)),
progressive disclosure withholds for attention, and the prompt is where both
policies are enforced.

## Where the workspace sits

What `$PWD` carries enters after the assembly's purpose. A nonblank ordinary
flow procedure follows workspace context and precedes the stage's instruction:
the assembly frames, the workspace informs, the procedure orients, the stage
directs.

What a workspace is announced as is one line, whatever the file holds. Under
`announce` a tree cannot open a section of the prompt, because nothing it wrote
is copied into one — it is named, and the naming is the runtime's own sentence.
Under `use` the document's body is a section, which is what `use` means and why
the default is `ignore`: letting a workspace speak is a caller's deliberate
act, never something a repository can arrange for itself.

## What the runtime adds, and does not

The runtime normally contributes the names and nothing more. It does not say a file came
from a branch, from the previous stage, or from an alternative that was chosen,
because those words would describe a system the agent is not told about
([invariants](invariants.md)). What `risk.json` means is what the stage's own
prompt says it means, and the author writing that prompt is the one who knows.

A resume failure artifact is the narrow exception. The runtime labels its named file as prior-attempt data so the failed stage does not treat retained diagnostic text as a new instruction.

Naming the files is still what makes fan-in work. A stage after a three-branch
`PARALLEL` is told it has `research.txt`, `risk.json`, and `cost.txt`, so
nothing has to go looking and no author has to keep a list of filenames in step
with a folder.

## What the agent is not told

- Where the assembly lives.
- Where the run record lives.
- Where its gate lives, or that a gate exists at all.
- Which provider or model is running it.
- What its timeout is, or how many retries it has left.
- How many repeats of a loop remain.

These are the runtime's business. An agent that knows its retry budget paces
itself against the budget instead of the work. An agent that knows it is on the
last repeat of a loop approves the last repeat. An agent that knows where the gate
lives can edit the gate, which is exactly what has happened, and half the
reason this format exists.
