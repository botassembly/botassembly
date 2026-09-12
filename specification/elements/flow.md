# The flow

> **Stability: stable.**

A flow is a procedure: do this, then this, then this. It is a folder under the
assembly's `flows/` directory, typed by a `FLOW.md` file, holding numbered
stages.

```text
flows/
  review/
    FLOW.md
    01-read.md
    02-analyze/
      STAGE.md
      schema.json
      gate.sh
    03-report.md
```

Stages run from the lowest number to the highest. Nothing else decides the
order, and nothing inside a stage names what comes next
([the control graph](graph.md)). A sequence number is at most nine digits —
enough for any flow, and short enough that every reader orders them the same
way (`number-invalid`).

## How the stages connect

Each stage's output becomes the next stage's input. In slot terms, what
`02-analyze` wrote to `$OUTPUT` is what `03-report` finds in `$INPUT`, under the
name `analyze` ([slots](slots.md)).

The first stage's `$INPUT` holds the run's request. The flow's output is the
output of its last stage.

The flow's exit code is the exit code of the first stage that failed, or zero if
none did. A stage that fails stops the flow: the stages after it do not run.

## `FLOW.md`

`FLOW.md` is frontmatter followed by an optional procedure body. The body
explains work shared by every stage in the flow, and tells each fresh context
its enclosing structure and static root step. A missing or whitespace-only body
is silent — it adds nothing to a prompt. The fences are still written, because a sentinel is
frontmatter and body everywhere ([invariant 42](invariants.md)):

```markdown
---
description: Review a change and report what is wrong with it
tmp: flow
---

Read the change, verify each finding, then write the report.
```

`description` is required and is one line. It is what a routing decision reads,
so it should say what the flow is for rather than how it works; it is not prompt
content. The procedure describes the whole flow, not the instruction for one
stage.

`tmp` is `stage` or `flow`, and it says whether every stage gets its own scratch
directory or they share one for the whole flow ([slots](slots.md)). It is
`stage` unless this says otherwise.

Any of the assembly's authorable defaults — `timeout`, `retries`,
`local-context`, and `intelligence` — may be set here, and every stage in the
flow inherits them unless it sets its own
([the assembly](assembly.md)).

## Routing

A run that names a flow runs that flow. A run that names none runs the assembly
itself: one agent with every flow and every root subflow in scope, calling
whichever fit the request and answering with what comes back
([running the assembly](invocation.md#running-the-assembly)).

## Skills

A `skills/` directory in the flow folder is visible to every stage in that flow
and to no stage outside it. This is the middle of the five skill scopes
([skills](skills.md)).

## Subflows

A `subflows/` directory in the flow folder holds flows that every stage in this
flow can call, and no stage outside it. This is the middle of the three subflow
scopes ([subflows](subflow.md)).

## Where the checks live

Hooks, schemas, gates, and checklists belong to stages ([gating](gates.md)). A
flow that wants its input normalized or its result published says so in the
stage at that end of the sequence, which is where the work is.
