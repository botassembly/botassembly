---
flow: build
priority: 8
---
# A failed append ends the run loudly

The record writer serializes appends through one promise chain: `tail = tail.then(() => appendFile(...))` (`bot/src/record.ts:49-56` at 3cb718b). A single rejected append rejects every subsequent append on that chain — including `run_end` — so one transient disk error mid-run makes the record permanently unsealable, and any append site that does not await becomes an unhandled rejection. The defect predates the recent tickets, but 0150 and 0132 each added append sites on top of it.

The record is the product; a run whose record cannot be written has nothing truthful to continue toward.

## Done, observably

- The first append failure ends the run as a fault naming the underlying I/O error, immediately — no continuing with holes in the record, and no poisoned chain making later unrelated appends fail with the first error.
- After that fault, behavior is deterministic and no unhandled promise rejection escapes; a test injects an append failure mid-run and proves both.
- A run with no append failures is byte-identical to today.

## Boundary

The append-only discipline, event shapes, and ordering guarantees stay exactly as they are. This ticket changes failure behavior only.

## 2026-08-27 addendum

One more silent path is in scope: `bot/src/record.ts:50-51` drops any append after `run_end` without a trace (`if (ended) return Promise.resolve()`). A post-seal append is a bug in the caller, and it must surface loudly — the same rule as a failed append — rather than vanish. Nothing else is added.
