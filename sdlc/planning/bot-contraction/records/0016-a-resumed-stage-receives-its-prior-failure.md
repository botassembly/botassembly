---
flow: build
priority: 9
completed: 2026-09-05
---
# A resumed stage receives its prior failure

## Result

An applicable `bot resume` now gives the first fresh plain root stage one bounded prior-attempt failure artifact beside its unchanged ordinary source. The ordinary source remains the retained request for a first-stage restart or the last carried predecessor output for a later stage.

The donor's final unsuccessful stage and terminal run must agree on exit and cause. Any recorded terminal stage identity must also agree. Outside signals, container failures, nested failures, and later stages receive no artifact. The new run retains newline-terminated JSON within 4,096 UTF-8 bytes and binds its exact path and SHA-256 through the existing `stage_start.received` field. No new event or record generation was added.

## Evidence and review

The initial red tests showed both restart forms receiving only their ordinary source. The green black-box test makes the resumed stage read the donor's failure and change its output. Focused cases cover absent and Unicode-shortened reasons, exact hashes, deterministic name collisions, donor immutability, mismatched terminal facts, successful donors, signals, containers, and later-stage isolation.

Independent design review restricted the behavior to the same first-fresh plain root stage. Independent code review found that the first implementation could overwrite a carried source at the chosen evidence path and inferred evidence meaning from that path. The remediation checks every carried path, carries an internal source role, and labels only role-marked files that still exist after a `before` hook. A second review rejected packed code used to satisfy a physical-line cap. The final code keeps the public record projection and internal role projection visibly separate. Independent rereview accepted the result.

## Cost and deferred work

Production source grew by 103 nonblank lines, from 12,975 to 13,078. Most of the change validates and bounds donor failure data before it crosses the prompt boundary. The implementation reuses the current input materialization and `stage_start.received` record shape.

This ticket does not pass nested container failures to restarted branches. A container restarts as a unit and receives no branch-specific diagnostic. It does not resume sessions, copy failed output or transcripts, or change Factory retry policy.

## Checks

The primary complete gate passed all 186 test files and 1,168 tests, including 142 of 142 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 13,078-line source ratchet, the specification check, and `git diff --check` passed.
