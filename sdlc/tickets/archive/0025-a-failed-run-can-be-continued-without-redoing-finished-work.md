---
flow: build
priority: 9
---
# A failed run can be continued without redoing finished work

Ian's ruling, recorded as ADR 0020: run information must be
accurate, the system must not alter it irresponsibly, and record
doctrine must never prevent progress. This ticket is that ruling's
first application.

Today a run is all-or-nothing: a fault in stage three discards
stages one and two, though both finished, passed their checks, and
sit sealed in the record. On 2026-08-12 provider faults discarded
35 million tokens of work in one day, and the two largest losses —
8.1M and 18.8M — both died with most of their work already sealed.
Run `2026-08-12T12-29-54-45e1` sealed 01-design (13.3M) and
02-design-review (3.8M), then lost a socket in 03-code: 17.1M of
finished, checked work thrown away to redo 1.7M of unfinished work.
The retry ladder (ticket 0024) prevents the cheap deaths; this
ticket makes the expensive ones cheap.

## Behavior

A caller can start a run that continues from a named prior run:
the finished stages are taken from the donor, and execution begins
at the first stage the donor did not finish. The work that was
checked is not paid for twice.

Done looks like:

- Continuation is the caller's explicit choice, named on the
  invocation. Nothing continues automatically or silently.
- The new run's record tells the truth about provenance, plainly:
  which stages came from which run, and which ran fresh. A reader
  of either record cannot be misled about what ran where.
- The donor run's record is not modified. It stays exactly the
  record of what that run did, including its fault.
- Carried-forward work is work that finished and passed its
  checks. A stage the donor started but did not finish is never
  carried — unchecked work with side effects is how records start
  lying (ADR 0020's absolute limits).
- A continuation that cannot honestly proceed refuses with the
  reason — donor missing, donor's finished stages unreadable, or
  the flow shape no longer matching the donor's.
- Exit codes, settlement, and the record contract behave as they
  do for any run; a continued run is a run.

## The hard choices

Settled (ADR 0020 rule 3): the specification's "a dead run is
dead / a runtime offers no `--resume`" language (runtime.md,
invariant 44) is this ticket's to revise. The dead run stays dead
and unmodified; distinguish continuing *from* a run's finished
work — permitted by this ticket — from resurrecting a dead
process, still forbidden. Rewrite the sentences openly, with the
reason, rather than designing around them.

Settled: never carry a half-finished stage. The stage is the
atomic unit.

Left to design: the mechanism — whether the new run copies the
donor's finished outputs, references them, or something else, and
what happens with the assembly capture when the donor's assembly
and the current one differ. Capture-matching is one honest answer;
stating the difference plainly in the record is another. Pick the
simplest one that cannot mislead a reader, and say what it costs.

Left to design: what the agent in the first fresh stage sees, so
that continuing is behaviorally equivalent to having been the next
stage all along — or, where it cannot be perfectly equivalent, the
record says so.

## Who consumes this next

The factory: its `failure` script can then choose "continue rather
than restart" for provider-fault causes. That wiring is a separate
ticket in the factory's own repo, filed after this lands. This
ticket only makes continuation exist and be invokable by hand.

## Tests

Pin: a run continued from a donor executes only the unfinished
stages; the combined outputs equal what a clean full run would
produce for the finished stages; both records state provenance
truthfully; the donor record is byte-identical before and after;
continuing from a donor whose finished stages are missing or
unreadable refuses with the reason; a half-finished donor stage is
not carried and the continuation starts there instead.

The src line ceiling may rise by at most 80 lines.
