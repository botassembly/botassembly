---
flow: build
priority: 5
deps: [0017]
---
# The record names each stage's workdir

Follows ticket 0017. Raised by the second factory's design review:
a reader reconstructing a run — the observability deck, a replay,
an auditor — must know where each stage actually worked, from the
record alone. Today nothing records it.

## Behavior

`stage_start` carries the stage's resolved working directory,
recorded as the authored value and its resolution relative to the
run's root — not a bare absolute path, so records remain readable
away from the machine that wrote them. A stage using the inherited
root records that fact rather than omitting the field silently.

`bot show` renders it. The record specification element documents
the field. Runs produced before this change remain readable —
readers treat the absent field as "the root," which is what it
meant.

Hashing the *contents* handed between stages is deliberately not
this ticket: that is project-side provenance, owned by the
project's own hooks (the second factory has its own ticket for it).
This ticket records where work happened, nothing about what moved.

The src line ceiling may rise by at most 10 lines.

## Refusal addendum, 2026-08-13 (architect)

The first flight's work is sound; its authorization was not.
Authorized exactly, for restating where the recorded workdir
appears in existing assertions: `bot/tests/cli-json-and-show.test.ts`,
`bot/tests/cli-stage-workdir.test.ts`, `bot/tests/show-reading.test.ts`.
Every other assertion in those files keeps exact strength; test
content lands in design: commits.

On the ceiling: the raise is self-service now — take the 11 lines,
but the commit that raises MAX must carry the defense: what grew,
why the lines earn their place, and the named search for
duplication to remove first. The refusal was for the missing
defense, not the number.

The branch is prior art — continue it.
