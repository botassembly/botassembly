# ADR 0023 — The run store answers content questions through a disposable index

**Status: ACCEPTED** · **Date:** 2026-08-27 · **Author:** the architect seat, from Ian's observability direction of 2026-08-27 · **Amends:** nothing. Run records stay append-only, sealed, and authoritative (ADR 0020). This adds a derived reading surface over them.

## Context

The home holds 1,174 runs and 2 GB of records, and no verb answers a content question: which run mentioned this error, which tool call touched that file, when did a compaction eat the context. Today that job is grep over the run directories — slow, unranked, unfiltered, and outside every contract. The workspace's pi-log experiment (`experiments/166-pi-log`) already solved this shape for the pi session store: an incremental SQLite+FTS5 index, zero dependencies, derived from raw files that remain the only truth, disposable and rebuilt on schema bump, verified by sampled recount. On first contact it surfaced real defects — a 138-iteration tool loop, model binding faults, error families collapsing thousands of duplicates. The design is proven; it was never ported to bot's own store.

## Decision

1. **Raw run records remain the only truth.** The index is derived state: delete it and nothing is lost; rebuild it from the records at any time.
2. **The index is SQLite with FTS5 via `node:sqlite`, zero dependencies**, refreshed incrementally by file watermark (mtime+size), schema-versioned, dropping and rebuilding itself on version bump.
3. **The reader is tolerant.** An entry the indexer does not recognize is skipped and counted, never a crash; a new record format version surfaces as a visible tripwire in the reading, not silence.
4. **`bot find` is the reading** — a flat reading verb under ADR 0019's hierarchy law: full-text query over transcripts, tool calls, and error text, filtered by `--since`, `--until`, `--project`/assembly, and entry kind, answering in both forms per ADR 0022. Every hit prints its join keys: run id, stage, entry position.
5. **The index checks itself.** A sampled recount against raw records reports drift — the pi-log doctor's lesson, whose first run found its own bug, stands: the checker needs a checker, so the recount is tested against fixtures.
6. **Analytic readings come later, on the same index.** Error families, loop detection, latency and cost views are separate tickets once `find` proves the index; this ADR reserves no vocabulary for them beyond requiring they read the same index rather than growing rival ones.

## Consequences

- Content search becomes a contract, and a dashboard can offer search through `bot find --json` without reading any file itself.
- The index adds a maintained surface; the disposability rule caps its blast radius at rebuild time.

## Alternatives considered

- Grep on demand — rejected: 2 GB and growing, no ranking, no filters, no join keys.
- Indexing in the workflow orchestrator — rejected: the orchestrator knows nothing about run content, and layering is the design.
- An external search service — rejected: local-first, zero-dependency, no accounts is the family rule.
