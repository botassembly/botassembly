---
flow: build
priority: 9
completed: 2026-09-05
---
# A LOOP records the cause that ended its body

## Result

A `loop_done` event now retains the exact unsuccessful cause from its body. The complete vocabulary is `refused`, `exhausted`, `rejected`, `blocked`, `timeout`, and `fault`. The writer no longer reports the last three as `exhausted`.

The event keeps the repeat count and existing reason. The overall body, loop, and run result remain unchanged. Successful `stop` and `limit` endings remain distinct. A question loop that reaches its authored limit still records `limit` on the container and returns `rejected`. An outside signal keeps its existing signal sequence and writes no conflicting `loop_done` event.

The event constructor type and writer-shape test oracle own the detailed value table. The structural story validator remains narrow and does not duplicate it.

## Evidence and review

The initial six-cause test reproduced three failures. `refused`, `exhausted`, and `fault` already matched. `rejected`, `blocked`, and `timeout` each recorded `exhausted`. The corrected test covers all six failures through the loop executor. Existing tests cover `stop`, bodyless `limit`, question-limit rejection, signal omission, readings, and event shapes.

Independent design review rejected two ticket statements that assigned future reason bounding to this work and assigned the writer's value table to the structural validator. Independent code review found the old vocabulary in ADR 0008 and the contraction event-schema note. Both reviews accepted the corrected result.

## Cost and deferred work

Production source has zero net nonblank-line growth. The change adds three honest outcome values without changing record shape.

This ticket did not change retry behavior, question handling, repeat limits, output handoff, other container behavior, signals, CLI commands, FANOUT, or reason bounds.

## Checks

The primary complete gate passed all 180 test files and 1,121 tests, including 142 of 142 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 12,629-line source ratchet, the specification check, and `git diff --check` passed.
