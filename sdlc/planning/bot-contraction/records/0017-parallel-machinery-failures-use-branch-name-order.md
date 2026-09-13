---
flow: build
priority: 9
completed: 2026-09-05
---
# Parallel machinery failures use branch-name order

## Result

When multiple started PARALLEL branches reject beneath normal stage results, the container now selects the rejection from the first affected branch in bytewise branch-name order. Completion timing no longer chooses the final fault reason.

Every started worker still settles. The existing `parallel_done` event still precedes the propagated rejection and lists branches in bytewise name order. The shared pool, `mapPool`, ordinary stage failures, outside signals, branch start policy, and unstarted branches retain their behavior.

## Evidence and review

A controlled red test started two branches, released the later-named branch first, and observed the old code report that later branch's machinery error. The green test runs both opposite settlement orders with latches and no sleeps. It proves both branches start and settle, both `parallel_done` facts record `fault/2`, and both runs select the earlier bytewise branch's reason.

Independent design review reproduced the pool's completion-order rejection list and placed the selection policy in the PARALLEL container. Independent code review confirmed that the rejection index already corresponds to bytewise branch order and that the direct execution-boundary test covers the owning behavior. The existing flow tests cover conversion of the selected rejection into the enclosing fault.

## Cost and deferred work

Production source did not grow. One selection expression replaced the completion-order lookup. The test added the deterministic concurrency proof.

This ticket does not change signal and machinery-rejection precedence. It does not cancel running siblings or attach reasons to individual `parallel_done` branch facts.

## Checks

The primary complete gate passed all 187 test files and 1,169 tests, including 142 of 142 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 13,078-line source ratchet, the specification check, and `git diff --check` passed.
