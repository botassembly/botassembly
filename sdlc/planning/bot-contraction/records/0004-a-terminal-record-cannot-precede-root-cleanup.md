---
flow: build
priority: 10
completed: 2026-09-04
---
# A terminal record cannot precede root cleanup

## Goal

Bot writes `run_end` after final process cleanup and shared temporary cleanup settle. The returned result and terminal record describe the same outcome.

## Evidence

At `9465e9f8`, `executeRun` appended `run_end` before the outer `runFlow` awaited root process cleanup. A held cleanup therefore allowed a successful terminal record before cleanup finished. A cleanup rejection could leave that success in the record and reject the caller afterward.

## Result

The outer run now owns the final root-wide process sweep. Recursive subflow runs seal their own records without sweeping sibling commands. Root settlement completes process cleanup, shared temporary cleanup and its diagnostic, then the terminal append.

The signal controller now has one stable barrier for signal records and process cleanup. Its terminal operation checks that barrier and closes signal admission in one continuation, then snapshots the signal and first cleanup or record failure before `run_end` starts. Work added during an earlier wait extends the barrier. A signal admitted before the close controls the terminal result. A later signal cannot alter the result or append after `run_end`.

Writer failure remains primary over cleanup failure and leaves the record without an invented terminal event. A signal-started cleanup failure survives a later successful cleanup. A thrown path still attempts root and shared cleanup before returning the original failure.

The first implementation duplicated child settlement, separate signal-event and cleanup promise chains, and several terminal wrapper helpers. Remediation replaced them with one typed signal snapshot, one stable barrier, one child drain, and one terminal transformation. The remaining 79-line source increase represents the explicit admission boundary, durable first-failure state, ordered root lifecycle, and deterministic tests' injection seam. Removing that state would restore the races this ticket closes.

## Checks

The focused suite covers twelve cases. It holds each cleanup boundary, exercises sibling subflows, admits signals immediately before and after terminal closure, reproduces a queued-microtask race at the close boundary, extends a final wait with newly scheduled cleanup, preserves cleanup and writer failure precedence, and proves that thrown work still cleans up. The final `make check` passed 166 test files and 1,010 tests, 142 of 142 conformance cases, lint, the four-clause catch budget, type checking, unused-code inspection, cycle detection, the exact 11,942-line source ratchet, and direct dependency pins.
