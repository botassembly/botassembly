# Gating

> **Stability: stable.**

An agent finishes a stage by stopping. Gating is what stands between stopping
and leaving.

Three checks run, in this order, and each is optional:

| Order | Check                          | Judges                    |
| ----- | ------------------------------ | ------------------------- |
| 1     | [the checklist](checklist.md)  | what the agent did        |
| 2     | [the schema](schema.md)        | the shape of the output   |
| 3     | [the gate](gate.md)            | whether the work is good  |

The order runs from cheapest to most expensive and from most general to most
specific. The first failure ends the round; a gate is never asked about work
whose checklist is unfinished, and a schema is never applied to a file that was
never written.

## Before any of them

An agent that stopped without writing `$OUTPUT` has not finished. That is caught
first, and it is treated like any other failure below. This is the one gating
text no author writes: the message is the runtime's fixed sentence, "Nothing
was written to `$OUTPUT`.", and its capture under that attempt's `checks/` is
named `output-missing.txt` ([the record](record.md#what-a-check-printed)).

## What a failure does

The agent is held, not restarted. Its session is intact, it has not left the
stage, and the failing check's output goes into that session as one more thing
it has read. It carries on working and stops again when it believes it is done,
and the checks run again from the top.

A gate that exits `75` with nonempty captured output is different: it is the
external-blocker verdict, not a failed round. It ends the stage immediately
with exit `1` and cause `blocked`, without a send-back or retry; its failure
hook still runs. No other check or machinery can produce that verdict.

## What the agent is told

That it is blocked from finishing, and the text the check produced. A failing
gate is the exception in shape, not in information: its output follows the
fixed action frame in [gate.md](gate.md#the-verdict). Nothing identifies the
gate or its place in the runtime.

The text arrives in the agent's session as the answer to its attempt to stop —
the agent went quiet, the runtime intercepted the stop, and this is what came
back ([invariant 30](invariants.md)).

It is captured to the run before it is handed over. A gate's capture is its
verbatim output; the agent's later session turn is the fixed frame followed by
those same bytes ([the record](record.md#what-a-check-printed)).

It is not told which check produced the text, that checks exist, that there are
three of them, or that anything ran at all. There is a thing it has to fix and a
description of what is wrong, which is everything it needs and the whole of what
it gets ([invariants](invariants.md)).

This is why what a check prints matters so much. It is not a diagnostic filed
somewhere; it is the description of what is wrong, and for a failed gate it
follows the runtime's request to act.

`retries` bounds how many send-backs a stage allows, whichever check caused
them. At the default of 2, the agent's first stop is checked and it may be sent
back twice — three rounds at most. When the last round fails, the stage fails.

This is the reason gating is worth its cost. A check that failed a stage
outright would throw away everything the agent learned and charge for it again.
A check that holds the agent in place costs one more turn.

## What gating is for

An agent working alone produces what it believes is right. Gating is the part of
the format that can disagree with it, in the author's words, written beside the
prompt rather than inside it. `schema.json` and a gate are decided by a program;
`schema.md` machine-validates its frontmatter only and leaves its body as an
unchecked template for the agent.

Each check covers what the others cannot see. A checklist catches work that
leaves no trace in the output. A schema catches an output that cannot be read by
the next stage. A gate catches an output that is well-formed and wrong.

## Where they live

A checklist is a heading in the stage's markdown. A schema and a gate are files
in the stage folder ([the stage](stage.md#what-a-stage-folder-holds)). All three
belong to one stage, and a stage is the only thing that has them: they hold an
agent back, and a stage is where the agent is.
