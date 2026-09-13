---
flow: build
priority: 8
---
# Human readings allow terminal-control injection

Promoted 2026-08-21 from
`sdlc/issues/0101-human-readings-allow-terminal-control-injection.md`
(severity should-fix, raised to high priority at triage: every human
and agent operating this factory reads this output constantly).

Untrusted transcript text, tool names, and run, stage, assembly, and
stranded-tree names are interpolated into human output without
escaping terminal control characters
(`bot/src/session.ts:5-6,28-39,88`; `bot/src/readings.ts:159`;
`bot/src/inspection.ts:303-306`). An ESC sequence inside a run can
repaint or spoof the reader's terminal.

Done, observably: every untrusted field in the human renderers
passes through the existing terminal-safe formatter, a control
sequence planted in a transcript arrives escaped rather than live,
and the promised exact-byte raw and machine interfaces are unchanged.

## Addendum, 2026-08-21

The first attempt refused at the code stage, correctly. Two authored
assertions contradict the approved design they were written under,
so no implementation can satisfy them and the code stage is
forbidden to repair an assertion:

- One expects a settled tool row to be produced from an unparseable
  timestamp. The design does not make an unparseable timestamp
  settle.
- One expects the status JSON to omit the established `bytes` and
  `installed` fields, while the same design requires that machine
  values are unchanged by this ticket. Only the human rendering
  changes; the JSON keeps every field it already emits, hostile
  names included, unescaped.

Authorized, exactly and only this: the design stage, continuing the
existing branch, repairs those two authored expectations so that
each states what the approved design actually produces. Everything
else about the approved design stands, and this addendum authorizes
no other assertion edits.

The behavior the ticket asks for is unchanged and worth restating,
because it is what the repaired assertions must pin down: a human
reading spells terminal control characters instead of emitting them,
in every reader a person or a supervising agent looks at, while the
record, the transcript's source bytes, and the machine-readable
output keep exactly the bytes they hold today.

## Addendum, 2026-08-21 (second)

The second attempt refused at the code stage again, on a different
contradiction than the first addendum named. That addendum was
incomplete; this one settles the question underneath it.

The authored test gave a pending tool call the role
`assistant\x1b[2J` and expected a settled tool row. It cannot get
one. Settlement requires the role to be exactly `assistant`
(`bot/src/session.ts:67`), deliberately, so a message whose role
carries anything else never becomes a tool row at all. No amount of
rendering at the boundary produces a row that was never built.

The ruling, so no third attempt has to find it: **settlement does not
change.** A message with a corrupted role is not a tool call and must
not become one — tightening or loosening that check is outside this
ticket entirely.

A hostile role is still a real surface, because the role is written
straight into the human transcript line
(`bot/src/session.ts:39`, `${timestamp}  ${role}  ${content}`).
That is the path where a hostile role reaches a reader, and that is
where it must be proved safe. The settled tool row is the wrong
vehicle for it; the tool name, the stage name, and the assembly name
are already proved through their own readings and stay as they are.

So: prove the role's escaping on the reading where a role actually
appears, and leave settlement alone. The design stage, continuing the
existing branch, may repair the authored expectation accordingly.
This authorizes no change to settlement, to the machine-readable
output, or to any assertion beyond the one that demanded a settled
row from an unsettleable message.
