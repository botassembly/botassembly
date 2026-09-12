---
flow: quickfix
priority: 9
completed: 2026-09-06
---
# Child sealing proof does not count event-loop turns

## Result

The concurrent-child cleanup proof now waits for the fast child's semantically valid sealed record under a two-second real-time deadline. The slow sibling remains blocked during that observation. Child sealing still performs no root process sweep. Final root completion still performs one.

The failure path now releases the slow sibling and awaits the root result before fixture cleanup. A failed observation can no longer create a secondary `ENOTEMPTY` race that hides the original assertion.

## Review and red-green evidence

The coverage run from suspended ticket 0042 exposed the old 100-`setImmediate` scheduling limit. It observed `turn` before `run_end`, even though the child was still progressing. Design review removed a circular demand for coverage execution from this ticket. Ticket 0042 owns that proof when its changes resume.

The repaired case passed 30 consecutive focused runs. All 17 cleanup tests passed. Independent code review accepted the elapsed deadline, semantic completion check, retained concurrency assertions, and settled failure path. Production code did not change.

## Checks

Focused ESLint and `git diff --check` passed. The complete root `make check` passed with 18 project tests, 203 Bot test files, 1,348 Bot tests, 143 of 143 conformance cases, and the unchanged 15,106-line production ratchet.
