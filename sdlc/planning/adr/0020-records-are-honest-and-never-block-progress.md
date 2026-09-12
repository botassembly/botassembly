# ADR 0020 — Records are honest, and never block progress

**Status:** adopted · **Date:** 2026-08-12 · **Ruled by:** Ian

## Context

The record vocabulary — sealing, capture, "a dead run is dead" —
was built to make run records trustworthy, and it worked. But on
2026-08-12 it started doing a second job nobody gave it: when
run continuation was proposed (35M tokens of finished, gated work
had been discarded by provider faults in one day), the first
design instinct was ceremony to preserve the invariant's wording
rather than the simplest honest fix. Ian's correction, which this
ADR records so it is never re-argued:

> I want the run information to be accurate, and I don't want the
> system to monkey with it irresponsibly, but I don't want it to
> prevent progress.

## Decision

1. **The record tells the truth about what happened.** That is the
   whole point of every record rule. Where work is carried forward
   from an earlier run, the record says which work, from where —
   plainly, so a reader cannot be misled.

2. **Past results are never silently altered.** Appending is fine;
   rewriting what a record already claims is not. "Irresponsibly"
   means: in a way a later reader cannot see happened.

3. **Record doctrine never blocks a legitimate capability.** When
   the simplest honest design for something worth building
   contradicts a sentence in the specification or an invariant,
   the sentence is rewritten — openly, with the reason recorded —
   rather than the design contorted to route around it. The spec
   serves the system.

4. **The vocabulary is descriptive, not sacred.** "Sealed" names a
   property (checked, finished, not since altered); it is not an
   argument. A design justified only by the vocabulary, with no
   accuracy or tamper-evidence at stake, has no justification.

## What this does not relax

Nothing here permits a record that lies, a result altered without
trace, or a half-finished stage's unchecked work presented as
checked. Those are the three ways records start misleading people,
and they remain absolute.

## Consequences

The run-continuation ticket (drafted 2026-08-12) is the first
application: a failed run can be continued without redoing finished
work, the record states the provenance, and invariant 44's "a
runtime offers no --resume" wording is the design stage's to revise
under rule 3. Future record questions get tested against Ian's
sentence above, not against the vocabulary.
