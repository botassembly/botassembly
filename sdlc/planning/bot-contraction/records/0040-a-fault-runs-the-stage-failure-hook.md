---
flow: quickfix
priority: 9
completed: 2026-09-06
---
# A fault runs the stage failure hook

## Result

The hooks specification now names an agent-reported `fault` among the endings that run a stage failure hook. It also says `$REASON` points to the retained fault-reason capture when that capture exists.

A real CLI test now proves that an agent fault runs one failure hook with `$CAUSE=fault` and the absolute path to the exact retained reason bytes. The hook event and diagnostic remain readable. The stage and run keep the original exit 2 fault ending. No retry or check runs. The signal exception remains unchanged.

## Review and red-green evidence

The new publication assertion first failed because the trigger list omitted `fault` and the `$REASON` paragraph omitted retained agent-fault evidence. The runtime test passed against the existing implementation. A mutation that excluded faults from the failure-hook path made the runtime test fail, and production was restored unchanged.

Design review initially rejected the ticket because it repaired only the trigger list. The amended ticket covered the matching `$REASON` gap and limited that promise to agent-reported faults. Independent code review accepted the exact environment, capture, hook count, ending, and signal proofs.

## Checks

The focused publication and hook suites passed 16 tests. The existing signal-exception test passed. Focused ESLint and `git diff --check` passed. The complete root `make check` passed with 18 project tests, 202 Bot test files, 1,346 Bot tests, 143 of 143 conformance cases, and the unchanged 15,106-line production ratchet.
