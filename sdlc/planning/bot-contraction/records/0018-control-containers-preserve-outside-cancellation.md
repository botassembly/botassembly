---
flow: build
priority: 8
completed: 2026-09-05
---
# Control containers preserve outside cancellation

## Result

Deterministic real-runtime tests now send SIGTERM while LOOP, CHOOSE, and PARALLEL have nested work running. Every enclosing run ends with the same signal. No later repeat, branch, or tail starts.

LOOP retains the active repeat's signal ending and writes no conflicting `loop_done`. CHOOSE retains its completed selection fact and the selected branch's signal ending. PARALLEL waits for both active branches, records their signal endings, leaves the queued branch unstarted, and writes the branch summary in bytewise name order.

## Evidence and review

The tests use abort listeners and latches. They do not use timing sleeps. Each test crosses the real `runFlow`, gating, signal, and record-writing boundaries.

The first design required mutations that changed each container's returned signal result to success. Those mutations did not turn the tests red because root settlement independently preserves an admitted outside signal and the sequence runner independently prevents later work. Design review removed that false requirement. The retained tests prove the durable facts that each container owns.

Independent code review accepted the three tests with no findings. The reviewer confirmed that both active PARALLEL branches record `stage_end` with exit 143 and cause `signal`, the queued branch remains unstarted, and all summaries preserve deterministic order.

## Cost and deferred work

Production source did not change. One focused test file adds three integration cases. The ticket does not change signal precedence, event shapes, repeat or branch policy, ordinary subflows, CLI behavior, or FANOUT.

## Checks

The focused implementation check passed three tests. Independent code review passed 31 related tests. The complete gate passed all 188 test files and 1,172 tests, including 142 of 142 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 13,078-line source ratchet, and `git diff --check` passed.
