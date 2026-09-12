# `LOOP.md`

> **Stability: stable.**

A loop is a stage that repeats what is inside it.

```text
03-refine/
  LOOP.md
  01-revise.md
  02-review/
    STAGE.md
    schema.json
```

The folder is typed by `LOOP.md` and holds numbered stages, which run in order,
over and over.

## `repeat`

```yaml
repeat: 10
```

One key, required on every `LOOP.md`, and it is always a ceiling: the most
times the loop may run. A runtime never invents a bound
([invariant 32](invariants.md)).

```markdown
---
repeat: 10
---

Is the draft ready to publish? Another repeat is only worth it if you have
something specific to change.
```

The body is the question. Writing one is what asks the agent; leaving it out is
what does not.

- **No body.** The loop runs `repeat` times and nothing decides anything.
- **A body.** The loop runs until the agent says stop, and never more than
  `repeat` times.

This is the same rule every sentinel follows: the body of the file is the
prompt.

## Who is asked, and when

The last stage inside the loop, because it is the only one that has seen the
whole repeat.

Its agent stops. The checklist, the schema, and the gate clear it
([gating](gates.md)). Only then is it asked the question, and it
answers with a control tool ([control tools](runtime.md#control-tools)). Asking
whether to go around again about work that just failed its gate would be asking
about nothing.

The question sits between the checks and the hooks: it is asked after the last
check clears and before `success` runs and the output seals, because until the
answer comes back the stage is not over — an agent may refuse or report a fault
at the question, and either ends a stage whose checks had already passed
([the runtime](runtime.md#control-tools)). The answer round runs inside the
stage's own `timeout`, like everything else the agent does. An agent that
stops without answering the question is held and asked again, spending a
retry like any failing round — `retries` bounds send-backs whatever caused
them, and an unanswered question is a round that failed.

The agent is told the question and not how many repeats remain — an agent that
knows it is on the last one approves the last one. Which repeat it is on is
derivable from its slot paths, and that is accepted; the ceiling is what never
leaks.

## Running out

A loop that reaches `repeat` while the agent is still saying continue
**fails**, with cause `rejected` — the assembly's own bound said no
([the record](record.md#what-it-names)).
The instruction was "until it is ready," and it never got there. Ten unfinished
repeats is not a success with the tenth draft.

A loop with no body cannot run out. It ran the number of times it was told to.

`repeat` is therefore a real budget and not a safety net. A loop asking a
question with `repeat: 1` fails the run the first time the agent says continue,
and one asking with `repeat: 3` fails after three clean, gate-cleared repeats.

## Input and output

The loop's first stage receives the loop's own input on the first repeat. On
every repeat after that it also receives the previous repeat's output, as
another named file in `$INPUT` ([slots](slots.md)):

```text
$INPUT/request.md      the loop's input, every repeat
$INPUT/review.json     the previous repeat's last stage, from the second on
```

Every name that can appear there is known before the run starts — after a
`CHOOSE` the loop's input is one of a known set — so two that could collide are
a malformed assembly and the run refuses, naming them.

The stages after the first one inside a loop are ordinary sequential stages:
each receives the output of the one before it, repeat after repeat.

The loop passes along the output of its last stage from its final repeat,
**under the loop's own name**: what leaves `03-refine/` above arrives in the
next stage's `$INPUT` as `refine`, with the extension the producing stage's
schema chose. Inside the loop the stages see each other's names; outside it,
which stage wrote the result is the loop's business
([invariant 26](invariants.md)).

## In the record

Each repeat is recorded separately, and every stage inside the loop is
identified by which repeat it ran in ([the record](record.md)). A stage that ran four times
is four entries, not one.

The decision that ended the loop is recorded with it. `ended_by` is `stop` when the agent stops, `limit` when the authored count ends the loop, or the exact failed-body cause: `refused`, `exhausted`, `rejected`, `blocked`, `timeout`, or `fault`. The event retains the body's reason. An outside signal writes the signal sequence and no conflicting `loop_done`.
