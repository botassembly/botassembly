---
flow: build
priority: 9
completed: 2026-09-05
---
# Large sessions remain readable in bounded pages

## Result

Rendered `bot session` output now uses stable bounded pages. A page contains 100 rendered messages by default and accepts an explicit limit from 1 through 500. Rendered stdout never exceeds 1 MiB. The reader also stops after about 4 MiB of source work at a complete source-line boundary. It returns an opaque continuation cursor whenever unread source remains.

The cursor binds the run, stage, repeat, record-selected session path, held file identity, size, timestamps, and next source-byte position. A cursor cannot select a path. A malformed, cross-selection, stale, mid-line, or out-of-range cursor publishes no transcript. A looped stage requires an explicit repeat before it accepts a cursor.

The page diagnostic distinguishes a proven additional message, unread session data, and the end of the fixed snapshot. Blank, malformed, non-message, and malformed-message entries advance the source position without consuming message capacity. An empty existing session succeeds with an explicit end statement.

Rendered session source lines are limited to 1 MiB before decoding or YAML parsing. The settled-tool reader keeps its former 16 MiB logical-line limit. One terminal carriage return does not count toward either logical-line limit. Small raw sessions remain byte-exact. Large raw sessions retain their existing refusal, and raw mode rejects paging flags.

## Evidence and review

The initial red suite rejected the new paging flags and returned no completeness statement for an empty session. The completed tests page a session beyond the former 1 MiB and 10,000-line limits, continue from a source-byte position, cross malformed entries, split multibyte text between chunks, and exercise append and replacement races.

Independent design review rejected an ambiguous raw-session sentence before implementation. Independent code review then found an unbounded page payload, unbounded irrelevant source work, a silently ignored loop cursor, and duplicate scanners. The first remediation added aggregate budgets, truthful continuation states, explicit repeat handling, and one shared scanner. Rereview found that an 8 MiB message was still parsed before refusal and that scanner consolidation changed the CRLF size boundary. The final remediation moved the rendered source-line limit before decoding and restored the logical carriage-return rule. Independent rereview accepted the result.

The first primary complete gate saw one failure in an existing raw-output timing test. That test passed all 15 cases immediately in isolation. A second complete gate passed. The observation does not establish a product regression. A repeated failure should create a focused reliability ticket.

## Cost and deferred work

Production source grew by 219 nonblank lines, from 12,690 to 12,909. Stable continuation, two aggregate budgets, snapshot binding, and the shared scanner account for the growth. Code review measured the original 8 MiB probe at about 329 MiB of additional resident memory. The final version refused it before parsing and used about 30 MiB more.

This ticket did not add JSON output, filters, the future noun-based CLI, unlimited raw-session streaming, Pi format changes, or record changes.

## Checks

The final primary complete gate passed all 184 test files and 1,159 tests, including 142 of 142 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 12,909-line source ratchet, the specification check, and `git diff --check` passed.
