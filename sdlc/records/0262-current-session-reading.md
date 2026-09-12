---
base: db764d84102a6eee7ea2285d15a569ac9e6c4bbd
head: 0e6b9f6faccdc35e437e4b3b8c2c98eb8a426663
---

# Add the current session reader

`bot run session RUN STAGE` now reads a rendered session page or exact raw session bytes. It preserves format-3 entries, format-4 transactions, version-1 and version-2 cursors, repeat selection, held snapshots, path replacement checks, append boundaries, and pagination without copying the underlying reader.

The current adapter bounds an encoded cursor before decoding and decoded bytes before parsing. It publishes every page, source, line, raw, cursor, and diagnostic limit through capabilities. Typed failures separate malformed requests, cursor conflicts, missing selections, integrity faults, filesystem faults, and output faults. The legacy route keeps its prior exits until ticket 0217.

Independent review found that smoke and two mechanical guards still owned the old spelling. The first repair migrated those owners and added hostile shell, module, argument-array, and documentation fixtures. A second review found that a word boundary allowed `session-old` and `events-old` to escape as assembly targets. The final exact-token rule rejects both lookalikes and accepts the two current operations.

The shared local check passed 117 repository tests, 1,809 runtime tests across 237 files, 143 conformance cases, and every static gate. Production source ended at 19,991 nonblank TypeScript lines. GitHub Actions runtime run `34666114199` and documentation run `34666114089` passed on the published head.
