---
flow: build
priority: 9
completed: 2026-09-05
---
# Gate feedback stays bounded without losing evidence

## Result

Bot now derives two bounded views from failed gate output after it writes the complete bytes to the existing check capture. The next agent turn receives at most 10,000 UTF-8 bytes. A gate-derived terminal reason contains at most 2,048 UTF-8 bytes. Short valid UTF-8 remains unchanged.

Larger valid UTF-8 uses a deterministic head-and-tail excerpt. The notice reports the original and omitted byte counts and directs the reader to the preceding `check.capture`. Cuts occur only between Unicode code points. Invalid UTF-8 exposes no partial decoded text or replacement characters. The complete original bytes remain available through the check event.

Ordinary gate retries, exhausted gates, and gates that exit 75 use the same formatter. Stage and run endings carry the same bounded terminal reason. The failure hook still receives the absolute path to the complete capture. The record event shape did not change.

## Evidence and review

Red runtime tests observed a 16,000-byte ordinary gate output in each retry prompt and a 16,007-byte exit-75 terminal reason. A later red unit test caught byte-order-mark removal during strict UTF-8 decoding. The implementation now validates with `isUtf8` and renders valid input from the original Buffer.

Independent design review accepted the existing `check.capture` reference instead of a new record field. Independent code review rejected the first implementation because the failed-check result retained the complete gate Buffer throughout the next model turn. The remediation removed that unused field. Independent rereview accepted the result.

## Cost and deferred work

Production source grew by 43 nonblank lines, from 12,592 to 12,635. The new behavior requires one small gate-feedback module. The ticket did not change the 16 MiB executable capture ceiling, hooks, control tools, gate exit meanings, retry counts, or record streaming.

Whole-record reading still loads a bounded record as one Buffer. The next ticket replaces that operation with bounded streaming without changing accepted record behavior.

## Checks

The primary complete gate passed all 181 test files and 1,131 tests, including 142 of 142 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 12,635-line source ratchet, the specification check, and `git diff --check` passed.
