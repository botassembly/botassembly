---
flow: build
priority: 5
---
# Inspection readers have no resource limits

Promoted 2026-08-21 from
`sdlc/issues/0102-inspection-readers-have-no-resource-limits.md`
(severity should-fix, filed by the 2026-08-20 observability review).

Record and session readers load and split whole files of
uncontrolled size, and status walks trees of arbitrary depth and
entry count (`bot/src/record-lines.ts:96-105`;
`bot/src/one-run.ts:155-160,216-220`;
`bot/src/inspection.ts:248-253,318-327`). A home with huge
transcripts, records, or trees can exhaust memory, CPU, or stack.

Done, observably: byte, line, depth, and entry limits apply before
allocation; an input past a limit produces a bounded unreadable or
too-large diagnostic and the command's normal exit discipline, never
exhaustion. The limits' values and where streaming replaces loading
are the design's choice.

## The behavior this replaces (2026-08-22)

Today an inspection command reads a record of any size and emits it
byte-for-byte; the shipped suite pins that with a deliberately oversized
record. That is the behavior this ticket replaces. Once a ceiling exists,
every inspection reader is subject to it — including `bot show --json` —
and an oversized record produces the bounded too-large diagnostic instead
of its contents. A reviewer meeting a restated assertion about an
oversized record being emitted whole should read it as intended.

The first attempt (2026-08-21) refused at the code stage for exactly this:
the design set a ceiling for every record read, the shipped assertion
required `show --json` to emit an oversized record intact, and code is
forbidden to change an assertion. The design was right; the ticket had not
said the old behavior was going away. It says so now.

If the design concludes a particular reader should be exempt rather than
bounded, that is the design's call to make and to justify — but it must be
made in the design, not discovered by the code stage.
