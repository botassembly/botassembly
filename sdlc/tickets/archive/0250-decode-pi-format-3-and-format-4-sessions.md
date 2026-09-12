---
flow: build
priority: 1
deps: []
---
# Decode Pi format-3 and format-4 sessions

## Outcome

Bot turns retained Pi format-3 entries and new format-4 transaction writes into one ordered logical entry stream. Existing public session and tool readers use that stream.

## Current facts

Pi 0.85.1 stores format-4 session lines as transactions. One physical line can contain several writes and uses numeric timestamps. Bot currently expects one format-3 entry with a string timestamp per physical line. Whole-session rendering, settled-tool extraction, and incremental tool reading can therefore omit new messages and tools.

## Scope

Add one private `bot/src/session-decoder.ts` owner shared by session rendering and tool reading, then by later pagination and search indexing. Normalize direct format-3 entries and format-4 entry writes. A logical item carries the entry, its parsed millisecond timestamp, and its display timestamp. Preserve an accepted format-3 timestamp string for display. Render an accepted format-4 numeric timestamp as UTC ISO text. Format-4 entry fields remain on the committed write beside `kind`, `seq`, and `timestamp`; no nested entry object exists. Preserve transaction order. Ignore non-entry writes and malformed writes individually while retaining valid siblings.

Move whole-session rendering, settled-tool extraction, and the incremental consumers in one-run inspection and explain onto plural private readers. Preserve the public `bot/session` exports, raw bytes, attempt and session relationships, child sessions, resumed sessions, and current malformed-input tolerance. Keep `renderSessionEntry` and `settledSessionToolReader` signature-compatible for direct-entry callers. They retain their existing one-direct-entry behavior. High-level supported readers use the plural path for formats 3 and 4. Pagination remains on direct format-3 entries until ticket 0251 adds an intra-transaction cursor.

Do not change pagination cursors, search indexing, session writing, Pi packages, retry behavior, model or credential ownership, or public command names.

## Acceptance

Literal public-format fixtures cover one format-3 entry, format-4 single-write and multi-write transactions, numeric timestamps, non-entry writes, malformed writes beside valid entries, and several settled tools in one transaction. Whole-session and incremental readers return every valid logical entry once and in order. Tool timestamps and durations remain correct. Existing importable-reader, attempts, child, resume, logs, and explain tests stay green.

## Dependencies

None.

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 7
- Minimum level floor: none
- Final level: 3
- Reasons: The supported high-level result stays stable while low-level exported helpers retain their direct-entry signatures. Several readers must preserve old evidence and decode multiple ordered writes from one line. Compatibility proof must cover malformed siblings and exact tool ordering.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if implementation changes pagination, search caches, public output, or physical storage.

## Review

- Design review: accepted 2026-09-11
- Code review: accepted 2026-09-11 after pagination stayed with ticket 0251
