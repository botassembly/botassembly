---
flow: build
priority: 9
completed: 2026-09-05
---
# A checked list runs one subflow per item

## Result

An authored root flow can place `FANOUT.md` between one JSON stage and one ordinary successor stage. FANOUT reads one named list from the sealed predecessor output, validates the complete manifest before starting children, sorts items by bytewise id, and runs one authored subflow per item. Authored `width` and `max-items` values bound execution. The first implementation accepts at most 32 items and forbids nesting.

Every planned item receives one sorted disposition. Ordinary child failures and child machinery faults do not stop siblings. Outside cancellation stops new launches, settles started children, records unstarted items, and ends the parent with the same signal. Aggregate selection uses disposition class and bytewise item id. Completion timing has no effect.

FANOUT succeeds only when every child has one sealed output owned by the selected subflow's exact final stage. Bot holds each accepted output descriptor. The successor receives those fixed bytes as `<id>.<extension>` files through bounded streaming and incremental hash verification. Missing, changed, replaced, appended, short, unreadable, unwritable, or unclosable sources prevent successor start and remove partial destinations. Empty and larger-than-1-MiB outputs retain their exact bytes. Failed FANOUT never supplies a partial set.

The parent record keeps shape 1. It adds `fanout_start`, FANOUT-owned `subflow_call` rows, and `fanout_done`. The structural reader enforces the small start, row-placement, ending, terminal, and signal story under ADR 0025. Writer and conformance tests own manifest, plan, child, output, aggregate, and successor agreement.

## Review and red-green evidence

Independent design review removed a new JSON canonicalization dependency, duplicate-aware parser, whole-graph output analysis, and detailed global record replay. The implementation reuses one extracted subflow-child lifecycle and the existing bounded pool.

The first code review reproduced two critical output defects. A replacement after verification could change successor bytes, and an inspection reader imposed an undocumented 1 MiB child-output limit. It also required exact final-stage ownership and stronger interruption, resume, field-ledger, and cross-event proofs. Descriptor-held streaming and the new adversarial tests closed those findings.

The second code review found that zero-byte sources created no destination and a destination-construction exception leaked the held descriptor. Five red tests reproduced those defects. The shared copy primitive now creates empty destinations, reports write interruptions, and closes exactly once.

The first complete gate found one ordinary-source regression and stale refusal and human-reading fixtures. An ordinary source owns its `diskPath`; only FANOUT carries a held descriptor. A focused red test reproduced the mistaken path assumption. The final change restored ordinary `diskPath` materialization and retained the stronger FANOUT path. Independent code review accepted the remediation.

## Cost and accepted trade-off

Production source grew from 13,078 to 13,646 nonblank lines. FANOUT owns most of the 568-line increase in one local runtime module. Small authored, event, source-materialization, record-field, and runtime-slot modules keep existing owners below their limits and prevent a second child lifecycle.

Bot reads each successful child output twice through the same held descriptor. The first pass accepts the exact child artifact. The second pass materializes and hashes the fixed snapshot for the successor. This costs one extra sequential read per output. It avoids pathname races, output-sized buffers, and speculative root-wide budgets.

## Checks

The final complete gate passed all 192 test files and 1,230 tests, including 143 of 143 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 13,646-line source ratchet, specification checks, and `git diff --check` passed.
