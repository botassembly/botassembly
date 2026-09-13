---
flow: quickfix
priority: 10
completed: 2026-09-06
---
# Raw output waits for a slow reader

## Result

Every raw CLI command now waits through temporary stdout backpressure. Bot uses one non-closing adapter over Node's existing stdout stream instead of a second filesystem stream around the inherited nonblocking descriptor.

The deterministic real-child proof pauses its reader beyond pipe saturation. The child stays alive, then delivers all 1,048,576 bytes with exit 0 and no diagnostic after the reader resumes. Closed pipes remain quiet. `/dev/full` remains a bounded nonzero failure.

## Review and red-green evidence

The complete repository check exposed the defect twice while completing the legacy retirement ledger. Five focused runs passed, but a longer paused-reader reproduction failed ten of ten times after 196,608 bytes with `stdout delivery (ERR_SYSTEM_ERROR)`. That evidence distinguished a product bug from the original test's weak pressure latch.

Independent design review confined the repair to `process-output.ts` and strengthened the real-child synchronization. Independent code review found that the first repair failed to restore existing stdout error listeners after an error. Remediation restored listeners after clean and failed delivery and added focused coverage for both paths. Re-review accepted the result.

## Size decision

- Starting production size: 15062 nonblank lines
- Ending production size: 15082 nonblank lines
- Simpler approach tried: delegate writes directly to `process.stdout` without changing its existing error listeners
- Why insufficient alternatives were rejected: the existing listener throws a real output fault before the raw command can return its bounded diagnostic; the adapter must own that listener until the pending descriptor error has fired
- Production code deleted: the duplicate filesystem stream import and construction
- Accepted cost: one raw command temporarily owns the process-wide stdout error listener set; Bot runs one command per process

## Checks

Focused raw-output tests passed 26 of 26. Type checking, lint, and `git diff --check` passed. The complete root `make check` passed with 201 test files, 1,332 tests, 143 of 143 conformance cases, and the 15,082-line production ratchet.
