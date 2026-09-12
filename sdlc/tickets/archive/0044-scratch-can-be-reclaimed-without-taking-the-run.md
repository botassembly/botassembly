---
flow: build
priority: 6
---
# Scratch can be reclaimed without taking the run

Ticket 0043 gave prune scratch rows, but paired with removable
runs: scratch is only reclaimable when its run is. The same day it
landed, the disk refilled — 34 gigabytes of scratch from that
day's runs alone (Rust test archives are large), while the runs
themselves were days from any removal selection and their records
worth keeping. The operator hand-deleted scratch a second time.
The common case is exactly this: the record is history, the
scratch is dead weight, and they age at different speeds.

`bot prune` gains a scratch-only selection — a flag naming that
the caller wants scratch reclaimed while every selected run's
directory stays. Under it, the report lists only scratch rows:
the scratch of ended runs matching the selection, plus the
orphans it already knows. `--delete` takes what was reported and
nothing else; a live run's scratch is never listed, as ever. The
default invocation without the new flag reports exactly what it
reports today — this composes with 0043's shape, changing none of
it. Post-run scratch persistence stays the lifecycle truth (the
0043 refusals proved the suite observes it); reclamation remains
an operator-invoked prune, never a run's own ending.

Done means the operator can reclaim every ended run's scratch
with one prune invocation that deletes no run directory, and the
flagless report is byte-identical to today's on the same state.

Named for restatement in `design:`/`design-review:` commits: none
expected — 0043's report-shape assertions keep full strength
because the flagless shape is unchanged; new cases land beside
`bot/tests/prune-selects-only-what-was-asked.test.ts`.
