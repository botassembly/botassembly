---
flow: quickfix
priority: 7
completed: 2026-09-06
---
# The runs help example selects a real state

## Result

The legacy `bot runs` help example now uses `1/rejected`. The runtime produces that state and the exact state filter selects it. The dead `1/failed` example is gone. Parser behavior and the noun-based run list did not change.

## Review and red-green evidence

The red test created a rejected run through the real runtime, read the state example from help, and found `1/failed`. The green test reads `1/rejected` from the corrected help and executes the documented filter against the same fresh home. Existing coverage still proves exact filtering and rejects near matches.

Design review confirmed that `failed` is outside the closed runtime cause vocabulary. Independent code review accepted the implementation without findings and confirmed that the earlier rejection assertions remain intact.

## Checks

Focused tests passed 15 tests across three files. Focused lint and `git diff --check` passed. The complete root `make check` passed with 19 project tests, 204 Bot test files, 1,350 Bot tests, 143 of 143 conformance cases, all 100 production modules in the coverage summary, and the unchanged 15,104-line production ratchet.
