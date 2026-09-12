---
flow: quickfix
priority: 7
completed: 2026-09-06
---
# The control-tool witness names fault

## Result

Invariant witness 7 now names the six ordinary control tools, including `fault`, and the conditional `subflow` tool. The runtime proof exhaustively asserts the ordinary tool order. Tool behavior did not change.

## Review and red-green evidence

The red publication proof showed that invariant 10 and the runtime table named seven tools while witness row 7 omitted `fault`. The runtime test now compares the complete six-tool ordinary sequence. Existing tests retain separate argument-shape and conditional-subflow coverage.

Design review accepted the narrow witness repair. Code review twice rejected publication checks that lost extra-name, category, order, or duplicate information. The final proof parses the invariant and runtime vocabularies independently, requires the exact ordered ordinary claim, requires conditional `subflow`, and rejects stale counts. Final review accepted it.

## Checks

Focused runtime and publication tests passed 19 tests. Focused lint and `git diff --check` passed. The complete root `make check` passed with 19 project tests, 204 Bot test files, 1,351 Bot tests, 143 of 143 conformance cases, all 100 production modules in the coverage summary, and the unchanged 15,104-line production ratchet.
