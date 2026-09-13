# `DESCEND.md`

> **Stability: stable.**

A flow that may call itself.

`DESCEND.md` stands in the place of `FLOW.md` as a flow folder's sentinel. The
flow is otherwise ordinary — numbered stages, the same frontmatter grammar, a
required `description` — and it may sit in `flows/` or in any `subflows/`
scope, invoked or called like any flow ([subflow](subflow.md)).

What the sentinel changes is one thing: **every stage inside the flow has the
flow itself in scope as a subflow.** A stage of an ordinary flow can never call
the flow it stands in, because a folder cannot contain itself and placement is
the only grant. `DESCEND.md` is the author writing the one grant placement
cannot express.

## `max-depth`

```yaml
description: Break a document into questions it can answer, and answer them
max-depth: 10
```

One key of its own, required: the longest unbroken chain of this flow's
self-calls. A run invoked from outside is at depth 1. A stage may
call its own flow only while the current depth is below `max-depth`; at
`max-depth`, the flow is simply not in its own stages' scope, and the agent is
told about the subflows that remain, which may be none.

`max-depth` bounds this flow's self-calls and nothing else. Another flow
between two invocations restarts the self-chain: this flow reached through a
subflow it called stands at depth 1 again. The runtime separately allows at
most ten subflow calls in a mixed-flow chain ([subflow](subflow.md)); that
fixed safety ceiling does not change the authored meaning of `max-depth`.

## What it is for

Decomposition the author cannot foresee. A twenty-page document does not
announce how it should be split; a codebase question does not say in advance
how many smaller questions it contains. A descend flow reads its input, hands
the pieces it chooses to invocations of itself, and composes what comes back —
each child a full run of the same flow, with the same checks, one level down
([subflow](subflow.md)).

The author still owns everything but the split: what the flow does, what its
stages are, what gates the work, and how deep it may go. The agent owns only
what placement could never say — how this particular input divides.

## In the record

A self-call is a subflow call and is recorded as one: an event in the parent's
record and a complete child run beneath it, at every level. The depth of each
invocation is recorded with it, so a reader can see the shape of the descent
without reconstructing it.
