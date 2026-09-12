---
flow: quickfix
priority: 9
completed: 2026-09-06
---
# The event-shape witness names the current proof

## Result

Invariant witness 46 now cites the six exhaustive event-constructor and field-shape tests that currently prove it. The row no longer preserves an obsolete constructor count or names a removed test. Its unreadable-input, LOOP placement, byte-stability, and honest-limit clauses remain.

A focused publication test requires the current proof titles and the separate clauses. It rejects the obsolete title and numeric event-constructor counts without hardcoding the current count.

## Review and red-green evidence

The new publication test first failed on the stale `record.test.ts` citation and fourteen-constructor title. Correcting the row made it pass.

Design review initially rejected a broad reference to “current proof names.” The amended ticket named all six exact tests and protected every separate witness clause. Independent code review confirmed that all six titles match live tests and that no unrelated semantic proof entered the row.

## Checks

The focused publication and event-shape suites passed 16 tests. Focused ESLint and `git diff --check` passed. The complete root `make check` passed with 18 project tests, 202 Bot test files, 1,344 Bot tests, 143 of 143 conformance cases, and the unchanged 15,106-line production ratchet.
