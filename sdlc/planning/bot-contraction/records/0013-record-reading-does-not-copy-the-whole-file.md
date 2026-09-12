---
flow: build
priority: 9
completed: 2026-09-05
---
# Record reading does not copy the whole file

## Result

Semantic record inspection now reads one fixed held-file snapshot in 64 KiB positional chunks. The reader splits on newline bytes, validates each complete segment as UTF-8, and parses accepted lines as they arrive. It no longer holds a complete source Buffer, a complete decoded source string, and a split source array at the same time.

The existing 1 MiB total limit and 10,000-segment limit remain. Short reads complete the requested range. Carriage returns remain part of the line. A nonempty unterminated final segment counts toward the limit and receives strict UTF-8 validation, but the semantic parser still omits it as torn evidence.

The reader fixes the snapshot at the descriptor size observed after open. It does not chase appends. It verifies the held descriptor and named path again after reading. A read error or unstable file takes precedence over an earlier content problem. No partial parsed data escapes any failed held-file result.

## Evidence and review

The red incremental-read test observed one 150 KiB read request from the former implementation. The green reader requested bounded chunks. Tests also cover seven-byte short reads, multibyte characters split between chunks, exact line-count edges, invalid UTF-8 in complete and torn segments, carriage returns, early read failure, append races, and path replacement.

Independent design review rejected reuse of the session line visitor because that reader permits much larger inputs, removes carriage returns, substitutes invalid UTF-8, and publishes its final unterminated segment. Independent code review found that the first implementation returned on a content problem before checking for a later read error or unstable file. The remediation retains the first content problem, finishes the bounded read without publishing more lines, performs final stability checks, and reports content only when the evidence remained stable. Independent rereview accepted the result.

## Cost and deferred work

Production source grew by 55 nonblank lines, from 12,635 to 12,690. The record-specific streaming parser preserves different semantics from the existing session summary reader. Raw record access, session reading, record classification, and CLI output did not change.

Session inspection still has its separate bounded whole-file path. The next ticket pages oversized sessions with an explicit completeness result.

## Checks

The primary complete gate passed all 182 test files and 1,145 tests, including 142 of 142 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 12,690-line source ratchet, the specification check, and `git diff --check` passed.
