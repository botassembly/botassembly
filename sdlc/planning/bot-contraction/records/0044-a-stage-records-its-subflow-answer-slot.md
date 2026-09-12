---
flow: quickfix
priority: 8
completed: 2026-09-06
---
# A stage records its subflow answer slot

## Result

A stage that receives `$SUBFLOWS` now records the same absolute path as `stage_start.slots.subflows`. A stage with no subflow in scope omits the member. A chooser continues to omit the complete slot object.

The change adds one optional string to record shape 1 under the pre-release additive-field rule. Subflow execution, answer materialization, prompts, paths, and other slot names did not change. Production source remained at 15,106 nonblank lines.

## Review and red-green evidence

The red runtime proof captured the gate's actual `$SUBFLOWS` value while the same stage's record omitted it. The green proof compares that captured environment value with the recorded value. A separate assembly with no subflows proves omission. The event-shape oracle accepts the optional string and rejects a wrong type and an unknown slot member.

Design review accepted the narrow additive record fact. Independent code review rejected compressed type formatting and an omission assertion that could pass without finding a stage. The remediation kept each type member readable through one adjacent export consolidation and made the test require both the stage start and its slot object. Final review accepted both corrections.

## Checks

The focused runtime and event-shape suites passed 15 tests. Type checking, focused lint, the specification check, the source ratchet, and `git diff --check` passed. The complete root `make check` passed with 18 project tests, 204 Bot test files, 1,349 Bot tests, 143 of 143 conformance cases, all 100 production modules in the coverage summary, and the unchanged 15,106-line production ratchet.
