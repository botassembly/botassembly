---
flow: quickfix
priority: 9
completed: 2026-09-05
---
# Raw record output uses the standard stream pipeline

## Result

Raw record copying now uses the safely opened file descriptor's read stream and Node's standard pipeline. The descriptor's initial size fixes the endpoint. Empty files complete directly. The copier checks the stream's byte count for an early end and closes the descriptor explicitly.

The raw path no longer owns chunking, backpressure, an output-owner counter, a claimed-error set, or a per-chunk listener lifecycle. A non-closing stream for file descriptor 1 isolates raw output from the reusable process stream.

Exact bytes, fixed snapshots, ignored appends, path-replacement isolation, child authorization, links, partial output, read, output, and close diagnostics, quiet `EPIPE`, and controlled `ENOSPC` behavior remain unchanged.

## Evidence and review

The initial structural test showed the custom mechanisms before the change. Independent code review rejected that test because it inspected source spelling instead of behavior. The test was removed. The behavioral suite remained intact.

The focused tests include a real delayed reader, exact multi-chunk output, an early-closing pipe, `/dev/full`, early end of input, append and replacement races, injected read, output, and close failures, descriptor cleanup, flags, and child authorization. The delayed reader received the complete 1 MiB record and left no process behind.

## Cost and deferred work

Production source fell by 37 nonblank lines, from 12,629 to 12,592. The Unix file-descriptor stream matches Bot's existing process model.

This ticket did not change raw behavior, validation, pruning, child authorization, other CLI output, FANOUT, or the broader CLI design.

## Checks

The primary complete gate passed all 180 test files and 1,122 tests, including 142 of 142 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 12,592-line source ratchet, the specification check, and `git diff --check` passed.
