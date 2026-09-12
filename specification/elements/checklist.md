# The checklist

> **Stability: stable.**

A checklist is a list of things the agent has to account for before it can leave
the stage.

It is the first of a stage's three checks. When the agent stops, the runtime
looks at the checklist, then at the schema, then at the gate
([the stage](stage.md#inside-a-stage)). All three are optional; whichever exist
run in that order.

## Where it is written

Under a heading whose text, whitespace-trimmed, is exactly the word
`Checklist` — case-sensitive, at any heading level — in the markdown body of
the stage, and nowhere else. A checklist belongs to one stage; there is no
flow-wide or assembly-wide list.

Every top-level list item under that heading, up to the next heading of any
level, is one checklist item. Nested items are part of the item above them.

```markdown
## Checklist

- Every public function has a docstring
- The test suite passes
- CHANGELOG.md names the change
```

The heading is part of the prompt, so the agent reads its checklist along with
its instructions. Nothing else declares it: no frontmatter key, no separate
file.

## The three states

Every item starts as **todo**, its start state. The agent moves it, one item at
a time, to one of two resting states:

| State     | Meaning                                            |
| --------- | -------------------------------------------------- |
| `todo`    | not accounted for                                   |
| `done`    | the agent did it                                    |
| `skipped` | the agent decided it did not apply, and said why    |

The agent marks items with the `mark` tool ([control
tools](runtime.md#control-tools)), giving an item's number — 1-based, in the
order the list is written, so two identically worded items stay distinct — its
new state, and evidence. Evidence is a required nonempty string naming the
proof; its quality is for the checklist author to demand, not the runtime to
judge. It cannot edit the list, add to it, or remove from it.

A skip also needs a reason. `skipped` with nothing behind it is not a mark: it
is returned to the agent as an error and the item stays `todo`
([invariant 33](invariants.md)). A mark without nonempty evidence is likewise
an error and leaves the item `todo`. The record is the point of allowing skips
and marks: an empty reason or empty or missing evidence records nothing.

Marking the same item twice replaces the first mark, and every mark is recorded
with its evidence, so an item that went to `done` and then to `skipped` shows
both. A number that is not on the list is an error returned to the agent, not a
stage failure.

## What it blocks

An item left `todo` when the agent stops blocks the exit. The unfinished items
go into the agent's session, followed by:

> The items above are unmarked. If an item is done, you must mark it with the `mark` tool; prose does not count.

The agent carries on working in that same session, exactly as it does when a
gate says no.

Being sent back for an unfinished checklist spends one of the stage's `retries`,
the same as any other check.

`skipped` does not block. A checklist is there to make sure nothing is passed
over silently, not to force every item. An agent that judges an item irrelevant
says so and moves on; what it said is kept in the record, so the decision is
visible instead of invisible.

Because a checklist fails before the schema and the gate are reached, an agent
that has not finished its list is never told what the gate thinks. There is no
value in judging work the agent has already been told is incomplete.

## Why it exists

A schema checks the shape of the output and a gate checks its content. Neither
can see the things that leave no trace in the output — the test that was never
run, the file that was never read, the step that was skipped because the agent
forgot it existed.

The checklist covers that gap in the cheapest way available: the agent is asked,
before it can leave, whether it did the things it was told to do.
