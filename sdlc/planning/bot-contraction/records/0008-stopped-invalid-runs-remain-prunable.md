---
flow: build
priority: 9
completed: 2026-09-05
---
# Stopped invalid runs remain prunable

## Result

Bot now lets an operator select and safely remove a stopped run whose record tells an invalid story. Exact names, `--keep`, and `--age` use one rule for records with `classification: invalid`. This includes malformed interior JSONL and parsed event sequences that tell an impossible story.

Age comes only from an exact writer-shaped run name. Bot validates its UTC calendar second and never substitutes a record or directory modification time. Bytewise keep order remains chronological for valid fixed-width names.

Automatic selectors continue to refuse missing, non-file, unsupported-version, and unreadable records. Exact-name escalation for those states remains unchanged. Every selector still passes through the shared run-lock, lock-contention, process-group, and owned-tree guards. Dry-run, JSON, and deletion share the same candidate and refusal logic.

## Evidence and review

Five red tests reproduced the old behavior. Keep refused both malformed and impossible stories. Age selected neither because it depended on `run_start`. The green tests cover both story shapes, UTC calendar validation, name-only age, retained refusal states, and live locks under every selector.

Independent design review rejected the first ticket because it did not define the eligible record class or exact UTC name contract. Independent code review rejected the first implementation because the specification changelog and two historical test explanations were stale. Both reviews accepted the corrected result. The reviewer verified all 1,927 retained run names against the contract and confirmed that the retained invalid run is now selected by age.

## Cost and deferred work

Production source fell by five nonblank lines. Automatic removal accepts the loss of recoverability for structurally invalid record bytes because the deletion proof does not depend on those bytes.

This ticket did not add raw record access, change the validator or default garbage cleanup, correct LOOP endings, add streaming, implement FANOUT, or redesign the CLI.

## Checks

The primary complete gate passed all 177 test files and 1,086 tests, including 142 of 142 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 12,444-line source ratchet, the specification check, and `git diff --check` passed.
