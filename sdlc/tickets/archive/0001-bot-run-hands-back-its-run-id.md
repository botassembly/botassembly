---
flow: build
priority: 8
---
A caller of `bot run` cannot learn which run it just started. The
queue that dispatches these runs must read the finished run's record
to decide a ticket's fate, and today it guesses: newest line of
`bot runs`. The guess assumes one run at a time, forever, and it has
already misfired once — 2026-08-06, a probe run started beside a real
flight, and the caller read the probe's `signal` cause instead of the
flight's `success`.

Give the caller the id. The shape is a design decision for this
repo, made against its own specification — two candidates from the
consumer's side, either of which suffices:

- `bot run --id-file <path>`: write the run id to the file at run
  start, before any stage executes, so even a killed run can be
  found.
- the id as the first line of stdout, ahead of the existing output.

Whatever shape wins, the specification is the law here: the spec
documents it, the conformance suite proves it, and `bot run --help`
teaches it. The consumer (queue's `readCause`) will switch to it and
delete its guess — that change is the consumer's own ticket, not
this one.
