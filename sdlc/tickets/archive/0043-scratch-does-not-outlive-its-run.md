---
flow: build
priority: 7
---
# Scratch does not outlive its run

Live case, 2026-08-16: `~/.cache/bot/tmp` had accumulated 43G of
per-run scratch directories since 2026-08-06 — every run's scratch
survives forever — and the disk reached 100%, crashing two live
runs mid-flight before an operator deleted the ended runs' scratch
by hand. `bot prune` could not have helped: it governs run
directories, and scratch lives outside them, owned by nothing.

Scratch is cache, and the run's durable story lives in the run
directory — the sealed record, sessions, and outputs. When a run
ends, on every exit path bot controls and whatever the outcome,
its scratch directory is removed. `bot prune` learns to sweep the
leftovers: scratch whose run has already ended or does not exist
(the crash-before-cleanup residue), under the same report-first,
`--delete`-to-act contract it already honors; scratch belonging to
a live run is never listed as deletable, matching prune's existing
refusal to touch a run that is merely quiet.

Done means a completed run — success, failure, or refusal — leaves
nothing under the scratch root, and a scratch directory orphaned
by a crash is reported by prune and removed by `prune --delete`.

Named for restatement in `design:`/`design-review:` commits: none
expected — existing prune and record assertions keep full
strength; new cases land beside the existing prune tests.

## Refusal addendum, 2026-08-16 (architect)

The refusal taught the ticket something: 33 shipped assertions
observe scratch after a run ends — post-run scratch is the
suite's window into what stages did, and deleting it at run end
demolishes that channel. The lifecycle deletion above is
withdrawn; do not remove scratch when a run ends.

The rescoped behavior is prune ownership alone: `bot prune`
learns scratch as a second thing it governs. It lists the scratch
of runs that have ended (and orphaned scratch whose run does not
exist) as removable under its existing report-first,
`--delete`-to-act contract; scratch of a live run is never
listed. The selection flags govern scratch the same way they
govern runs — a run outside the asked-for selection keeps its
scratch. Done restates accordingly: `bot prune` reports ended and
orphaned scratch with sizes, `--delete` removes exactly what was
reported, and a completed run's scratch remains on disk until a
prune takes it.

No shipped assertion changes under this scope. New cases land
beside `prune-selects-only-what-was-asked.test.ts`,
`prune-refuses-every-fault.test.ts`, and the scratch tests; if
the design finds one shipped prune assertion must widen to
mention scratch in its report shape, that restatement is
authorized in `bot/tests/prune-selects-only-what-was-asked.test.ts`
by this addendum.

## Second refusal addendum, 2026-08-16 (architect)

The second refusal was arithmetic the first addendum did not do:
prune's report gaining scratch rows changes every shipped
assertion that counts or enumerates the report, seven of them,
not the single widening authorized above. That prohibition is
lifted for the report shape and for nothing else. Restatement is
authorized by file in `bot/tests/prune-selects-only-what-was-asked.test.ts`,
`bot/tests/scratch-keyed-by-home.test.ts`,
`bot/tests/runtime-scratch-opacity.test.ts`,
`bot/tests/prune-refuses-every-fault.test.ts`,
`bot/tests/prune-refuses-unreadable.test.ts`, and
`bot/tests/cli.test.ts`, bounded by one rule: an assertion on the
report's rows or printed count may grow by exactly the scratch
rows of the same selection, and nothing more. The principles
those tests protect keep full strength — selection discipline
(nothing outside the asked-for selection appears, run or
scratch), every refusal guarantee, and scratch's opacity to the
runtime are not weakened by a single assertion.

## Third refusal addendum, 2026-08-16 (architect)

Two corrections, both the refusal's:

1. **A run with no scratch on disk yields no scratch row.** The
   bounded rule above meant this and did not say it — "the
   scratch rows of the same selection" are the scratch trees that
   exist, never a placeholder for one that does not. A design
   test expecting a row for a fixture that created no scratch
   contradicts this ticket; the design restates its own test to
   match.
2. The run-only report shape is also pinned in
   `bot/tests/run-birth-reservation.test.ts` and
   `bot/tests/run-capture-seal.test.ts`. Both are added to the
   authorized list under the same bounded rule — a report-shape
   assertion may grow by exactly the existing scratch rows of the
   same selection, nothing more. The reservation and sealing
   guarantees those files exist to protect are untouched.
