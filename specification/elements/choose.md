# `CHOOSE.md`

> **Stability: stable.**

A choose stage picks one of several alternatives and runs only that one.

```text
04-respond/
  CHOOSE.md
  escalate/
    01-page-oncall.md
    02-write-incident.md
  patch/
    01-write-fix.md
  revert.md
```

The alternatives are named, not numbered. They do not run in sequence, so a
number would be a lie about them. An alternative is a single stage file, a
stage folder, or a folder holding numbered stages that run in order.

## Who chooses

An agent. The body of `CHOOSE.md` is that agent's prompt, and it lists the
alternatives:

```markdown
---
---

- `escalate` — the change is unsafe and a human has to see it now
- `patch` — the problem is small and mechanical
- `revert` — the change should not have landed
```

An alternative is named in a code span at the start of a top-level list item.
That is the whole of the syntax: everything else in the body is guidance, and a
code span anywhere else names nothing.

Every alternative is something to do. A choice is between courses of action, and
one of them always runs.

The agent reads the input and names its choice with the `select` tool
([control tools](runtime.md#control-tools)). It has the stage's `$INPUT`,
`$TMP`, `$SKILLS`, `$PWD`, and `$SUBFLOWS` when any subflow is in scope, and
no `$OUTPUT`, because a choice is not an output. It may refuse or report a
fault, which fails the stage.

An agent that stops without selecting, or that names something that is not an
alternative, is told so and asked again in the same session — the same send-back
a failing check earns ([gating](gates.md#what-a-failure-does)). `retries` bounds
it, and the stage fails when they run out.

In the record the chooser is the choose folder itself, with a `retry` counter
and no output, and its session sits where any stage's session sits
([the record](record.md#identity)).

There is no other chooser. A deterministic branch — "if the input says
critical, escalate" — is a script's job, and a script belongs in a stage or a
gate, not wearing a `CHOOSE.md`: this element exists for the judgment call a
program cannot make. A `CHOOSE.md` with no body has no chooser and is refused
(`body-missing`). A choose with exactly one alternative is refused
(`chooser-invalid`): a "choice" with one course of action is a sequence wearing
the wrong sentinel. A choose folder with no alternatives at all is refused
(`folder-empty`).

## The names must match

Every name listed in the body must be a folder or file in the choose folder, and
every folder or file must be listed. A name with nothing to run, or something to
run that was never listed, is a malformed assembly and the run refuses before it
starts.

## Input and output

The alternative that runs receives the choose stage's input, unchanged.

The choose stage passes along that alternative's output, and the next stage
receives it named after the alternative ([slots](slots.md)):

```text
$INPUT/escalate.json
```

So a stage after a choice can tell which way the choice went without being told
— the filename says it. Whether it does anything with that is the author's
business.

Alternatives may produce different shapes, because they are different things.

## In the record

The record names what was chosen, what else was available, and the agent's
reason ([the record](record.md)). Alternatives that did not run are named, so a
reader can see what the run declined to do.
