# Decisions — `invariants.md`

*Historical (pre-ADR). Superseded by the specification and planning/adr/ as of 2026-07-31 — details below may contradict current truth (invariant numbers in particular have moved). Kept for the reasoning, not the rulings.*

Written 2026-07-30. Confirmed by Ian with no corrections before it was written.

## The decisions

**1. A separate document rather than a section in `runtime.md`.**
Options: a section of the runtime contract; a preamble to the README; its own
file. Chose its own file. The invariants are the thing a reviewer checks a
proposed feature against, and a list you have to go find inside a 200-line
document does not get checked. Cost: the same facts now appear here and in the
documents that own them, so the two can drift.

**2. Grouped by who is constrained, not by subject.**
Options: group by element (stage invariants, record invariants); group by kind
of guarantee. Chose the second — what the agent is not told, what it cannot do,
what the runtime guarantees, structure, what is not claimed. Reading it, the
question "is this a thing we promise or a thing we merely make awkward" is
answerable in one glance, which is the question that actually gets asked.

**3. Numbered, permanently.**
So they can be cited. `gate.md` and `inspection.md` already reference specific
numbers. Cost: an invariant that gets dropped leaves a hole in the numbering
rather than being renumbered, and that has to be respected forever.

**4. Keeping the "what is not claimed" group.**
This is the group most likely to be read as apology rather than specification.
Kept because it is the load-bearing honesty: a reader who thinks a stage is a
sandbox will build on that belief. Numbers 27 through 30 exist so nobody does.

**5. The closing paragraph naming 3, 27, 28, 29, 30 as one idea.**
Options: leave them as five bullets; write the synthesis. Wrote it. Five
separate statements of the same principle read as five hedges; one paragraph
naming them as one position reads as a position.

**6. "Obscurity is the mechanism" stated flatly.**
The alternative phrasings all softened it. It is the accurate description and
softening it would make the record seem optional, which it is not.

## Questions for Ian

- Invariant 6 says the agent is told nothing about stages other than its own.
  That is currently true, but a stage after a `CHOOSE` learns which alternative
  ran from its input filename. Is that a violation, an exception worth writing
  down, or a sign that 6 is stated too strongly?

## Follow up

- Nothing enforces these. There is no conformance test and no checklist a
  runtime author works through. That is fine while there is one runtime and
  becomes a real gap at two.
