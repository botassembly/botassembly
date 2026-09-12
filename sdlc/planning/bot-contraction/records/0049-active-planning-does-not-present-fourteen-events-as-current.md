---
flow: quickfix
priority: 6
completed: 2026-09-06
---
# Active planning does not present fourteen events as current

## Result

ADR 0008 now labels its unchanged 14-event table as the initial historical set. A nearby note points to the published record inventory, maintained schema ledger, constructor registry, and writer oracle as the current authorities. Active open questions no longer present the old count as current.

No current count replaced the old one. Runtime behavior, historical rows, archives, completion records, and changelog history did not change.

## Review and red-green evidence

The red publication proof failed on the ADR's old “closed, 14 types” heading. The corrected proof requires the historical label and current-authority pointers.

Design review accepted the split between preserved history and current authority. Code review rejected an exact old-sentence check that would miss reworded stale claims. The remediation inspects active record-planning statements and rejects any statement that combines 14 or “fourteen” with “closed” or “current.” Final review accepted it.

## Checks

Focused publication tests passed 13 tests. Focused lint and `git diff --check` passed. The complete root `make check` passed with 19 project tests, 204 Bot test files, 1,352 Bot tests, 143 of 143 conformance cases, all 100 production modules in the coverage summary, and the unchanged 15,104-line production ratchet.
