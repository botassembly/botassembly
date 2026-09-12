---
flow: quickfix
priority: 9
completed: 2026-09-06
---
# Stage access has one closed authored grammar

## Result

The stage specification now defines the complete `access` frontmatter grammar. It covers the mapping and operation arrays, the four operation names, both deny-all forms, runtime and declared slot exports, conditional `SUBFLOWS`, executable-name syntax, stage-only placement, and the fact that authorization does not prove installation.

A table-driven authoring test covers 21 accepted and rejected shapes through the real assembly reader. Existing tests continue to own runtime enforcement and omission compatibility. Parser and runtime behavior did not change.

## Review and red-green evidence

The publication assertion first failed because the stage specification had no Access section. Existing parser behavior was already green.

Design review rejected the first matrix because it omitted the mapping shape, non-string entries, invalid managed-slot names, positive `SUBFLOWS` scopes, and control-sentinel rejection. The amended matrix added those boundaries. Independent code review then found a broken documentation anchor. The corrected link passed the specification link check and final review.

## Checks

The focused grammar, publication, and runtime-access suites passed 13 tests. `sh sdlc/scripts/spec`, focused ESLint, and `git diff --check` passed. The complete root `make check` passed with 18 project tests, 203 Bot test files, 1,348 Bot tests, 143 of 143 conformance cases, and the unchanged 15,106-line production ratchet.
