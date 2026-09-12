---
flow: build
priority: 1
deps: [0250]
---
# Index Pi format-4 sessions

## Outcome

Search indexes every valid logical entry in a format-4 transaction and rebuilds caches created by the old parser.

## Current facts

The search index has a separate one-object-per-line parser. Its schema is version 2. Source reuse compares file identity and metadata, so an unchanged format-4 session cached under schema 2 would not rebuild after decoder support lands.

## Scope

Use the private logical decoder from 0250. Keep the public search-result schema at version 1. Retain physical line numbers as search positions. Logical entries from one transaction share that physical position. Raise the private cache schema from 2 to 3.

Keep `index.skippedEntries` as a count of parsed source items that produced no searchable message. A format-3 physical item counts once. A format-4 header, non-entry write, malformed array member, or unsupported logical entry counts once. A malformed whole physical line counts once. Valid searchable siblings do not erase another item's skipped count.

Do not change search syntax, ranking, public result fields, cache location, or cleanup ownership.

## Acceptance

Tests cover format-3 and format-4 content, numeric timestamps, several entries on one physical line, malformed writes beside valid entries, physical positions, and the exact skipped-entry rules. A pre-existing schema-2 cache with unchanged format-4 source bytes rebuilds and returns the previously omitted entries.

## Dependencies

0250 supplies the logical decoder.

## Complexity

- Contract score: 1
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 7
- Minimum level floor: level 3 for persistent cache invalidation
- Final level: 3
- Reasons: Search must change parsers and invalidate retained derived state without changing its public result contract.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if implementation changes public positions or cache ownership.

## Review

- Design review: accepted 2026-09-11
- Code review: accepted 2026-09-11
