---
flow: build
priority: 1
deps: [0250]
---
# Paginate logical session entries without loss

## Outcome

A session page can stop inside a format-4 transaction and continue without omitting or repeating a logical entry.

## Current facts

The current opaque cursor stores only a physical byte offset. A format-4 physical line can contain several logical entries. Message-count or rendered-byte limits can stop between those entries.

## Scope

Emit cursor version 2 with the physical byte offset and an intra-line logical ordinal. Accept cursor version 1 and interpret its ordinal as zero. Resume inside the same physical line when entries remain. Advance to the next physical line after the transaction is exhausted.

Preserve cursor opacity, cursor selection, source-work bounds, the 1 MiB physical-line limit, the 1 MiB rendered-page limit, held-file snapshot checks, raw bytes, and current format-3 behavior. Do not change search positions or cache schemas.

## Acceptance

Tests stop between entries in one transaction under both message-count and rendered-byte limits. Continuation returns every entry exactly once. Tests also cover version-1 cursor compatibility, completion after the transaction, invalid selection, invalid position and ordinal, oversized physical lines, source bounds, and stale-file rejection.

## Dependencies

0250 supplies the logical decoder.

## Complexity

- Contract score: 2
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 8
- Minimum level floor: level 3 for recovery state inside one durable transaction
- Final level: 3
- Reasons: The opaque cursor gains recovery state. A wrong offset or ordinal can hide or repeat retained evidence across page boundaries.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if the cursor encoding or physical storage contract changes beyond the stated version-1 compatibility rule.

## Review

- Design review: accepted 2026-09-11
- Code review: accepted 2026-09-11 after the renderer stayed private and exact-once tests covered every page
