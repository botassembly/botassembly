---
flow: build
priority: 9
completed: 2026-09-05
---
# Throwing preparation leaves no dead run

## Result

Successful completion of `RecordWriter.start()` now defines the transition from an unborn run to a started run. Every expected result and unexpected failure before that transition settles through one `unborn` cleanup function while Bot still holds the run reservation.

Successful cleanup removes the run directory and returns the original expected result or an operation-specific preparation fault. Failed cleanup takes precedence and returns its own bounded fault without claiming the directory disappeared. Preparation and cleanup diagnostics contain one line and at most 2,048 UTF-8 bytes. The outer cleanup still releases the reservation.

The post-start continuation executes outside the pre-start handler. Existing post-start faults retain their record ending. A caller-owned identifier file remains untouched before a successful record start.

## Evidence and review

Four red tests showed asynchronous capture and synchronous model-catalogue exceptions escaping, while injected record-start and cleanup failures were ignored. The green tests cover partial capture, partial record bytes, empty runs after successful cleanup, a retained directory after failed cleanup, reservation release, a succeeding next run, and an unchanged preexisting identifier file.

Independent design review removed incorrect claims about request, scratch, and identifier cleanup and defined successful record start as the exact boundary. Independent code review found that cleanup failure after a normal typed refusal still escaped as a thrown error. The remediation made `unborn` the single cleanup settlement point for expected and unexpected outcomes. Independent rereview accepted the result.

## Cost and deferred work

Production source grew by 66 nonblank lines, from 12,909 to 12,975. The explicit phase boundary, bounded diagnostic helper, and narrow test seams account for the change.

This ticket did not change post-start failures, record semantics, model selection, assembly validation, continuation behavior, inspection, pruning, or Factory behavior.

## Checks

The primary complete gate passed all 185 test files and 1,164 tests, including 142 of 142 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 12,975-line source ratchet, the specification check, and `git diff --check` passed.
