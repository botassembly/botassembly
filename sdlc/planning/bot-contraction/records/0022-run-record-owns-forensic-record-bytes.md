---
flow: build
priority: 8
completed: 2026-09-05
---
# Run record owns forensic record bytes

## Result

`bot run record RUN --raw` now copies one root run's retained `record.jsonl` exactly as stored. It requires raw mode, accepts common home selection, appears in capability discovery and generated help, and never parses or endorses the bytes.

The handler delegates directly to the existing `inspectRawShow` reader with no child selection. It adds no file opening, buffering, hashing, or streaming implementation. The legacy `bot show RUN --raw` command remains supported and produces the same accepted bytes.

The capability descriptor represents raw output without a fabricated schema version. It reports root-home reading, no mutation, no network, and only `--home` plus `--raw`. Invalid or conflicting forms fail before home access or legacy run-start parsing.

## Review and red-green evidence

Ten of twelve new tests initially failed because `run record` reached the legacy run-start parser and the capability inventory lacked `run.record`. The completed tests compare the new and legacy routes for empty, invalid UTF-8, malformed, torn, structurally invalid, unsupported-format, and oversized records.

Independent design review corrected the raw-failure promise. A failure before copying publishes no bytes. A midstream read, output, or close failure may preserve bytes already written. Independent code review accepted the implementation without changes after exercising parsing, home precedence, route ambiguity, descriptor and help agreement, and the existing raw race matrix.

The race tests cover replacement before and after open, fixed append boundaries, short reads, input errors, partial output, backpressure, output failure, descriptor-close failure, `/dev/full`, delayed readers, and quiet closed pipes through the new route.

## Cost and deferred work

Production source grew from 14,450 to 14,541 nonblank lines. The 91-line increase provides one thin command parser and the descriptor, dispatch, help, and test additions. The raw reader did not grow.

Child record selection remains on the legacy command. Rendered and structured record readings belong to a later `run show` ticket. Caller migration and legacy deletion remain later work.

## Checks

The first complete run found one unrelated large-output FANOUT test timeout. The focused failed test passed immediately in 5.69 seconds. A second complete gate passed all 196 test files and 1,266 tests, including 143 of 143 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 14,541-line source ratchet, specification checks, and `git diff --check` passed.
