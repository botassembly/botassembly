---
flow: build
priority: 9
completed: 2026-09-05
---
# Raw record access preserves the evidence

## Result

`bot show RUN --raw` now writes the selected record exactly as stored. Raw access does not parse, classify, normalize, or add a newline. Empty, invalid UTF-8, malformed, torn, structurally invalid, unsupported-format, and oversized regular records remain readable.

Bot opens one regular file through the held-file boundary and copies the size observed on that descriptor. It does not chase later appends. Replacement after safe open cannot redirect the descriptor. Missing, linked, replaced-before-open, non-file, and initially unreadable records refuse before record bytes reach standard output.

Raw child access requires exactly one started child fact in a structurally valid parent. It then preserves the recorded child's bytes without applying child semantic validation or parent-child outcome agreement. Invalid parents, unrecorded children, and linked paths refuse.

The copier waits for each output chunk. Input-read, standard-output, and descriptor-close failures return bounded phase-specific diagnostics with a stable error code when one exists. Previously written bytes remain. A closed output pipe stays quiet. `--raw` is exclusive with `--json` and `--check`. Existing human and parsed JSON readings did not change.

## Evidence and review

Fifteen initial red tests showed that the raw option did not exist. The completed test set covers exact bytes, unreadable structured shapes, fixed snapshots, replacement races, authorized and unauthorized children, links, flag exclusions, standard-output backpressure, interrupted reads, interrupted writes, descriptor-close failures, and descriptor cleanup.

Independent design review rejected the first ticket because it did not define snapshot, failure, or child-authorization semantics. Independent code review rejected the first implementation because the CLI did not await output backpressure. The second review reproduced an uncaught `ENOSPC` stack trace when output went to `/dev/full`. The final implementation gave the raw writer ownership of non-`EPIPE` output errors. The final review accepted the result after reproducing disk-full output, a quiet closed pipe, exact multi-chunk bytes, fixed snapshots, and all authorization boundaries.

## Cost and deferred work

Production source grew by 185 nonblank lines from the ticket baseline of 12,444. The explicit raw path adds code because it preserves arbitrary bytes without weakening operational record validation.

This ticket did not rename CLI nouns, change record validation or pruning, correct LOOP endings, add general record streaming, implement FANOUT, or add replay receipts.

## Checks

The primary complete gate passed all 179 test files and 1,114 tests, including 142 of 142 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 12,629-line source ratchet, the specification check, and `git diff --check` passed.
