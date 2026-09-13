---
flow: build
priority: 2
deps: []
---
# A current command reads a stage session

## Outcome

`bot run session RUN STAGE` reads one stage session through the current command surface. It preserves bounded rendered pages and exact raw session bytes.

## Current facts

The legacy `bot session` command is the only supported session reader. Maintained smoke exercises it. The public guides, specification, and ideal state promise session inspection. Tickets 0250 through 0252 already support old and transaction-based Pi sessions, logical pagination, and indexing.

## Scope

Add `run.session` to the command contract, capability inventory, dispatch, help, specification, documentation, and conformance boundary. Support `bot run session RUN STAGE [--repeat N] [--limit N] [--after CURSOR] [--raw] [--home DIR]`. Reuse the existing session reader. Preserve repeat selection, held-snapshot pagination, cursor validation, supported Pi formats, exact raw bytes, size limits, and failure behavior.

The descriptor publishes operation `run.session`, command `run session`, modes `markdown` and `raw`, raw output, home `reads`, mutates `false`, and network `never`. It lists `--after`, `--home`, `--limit`, `--raw`, and `--repeat`. The encoded cursor limit is 8,192 bytes. The decoded cursor limit is 6,144 bytes. Check both limits before parsing. A page defaults to 100 messages and permits 1 through 500. Rendered stdout remains at most 1,048,576 bytes. One source-work pass starts at most 4,194,304 bytes and scans at most 1,000,000 physical lines beyond its cursor before it stops after a complete line. Scanner state resets at each cursor. A rendered source line remains at most 1,048,576 bytes. Raw session input remains at most 1,048,576 bytes and 10,000 physical lines. Human errors remain within 2,048 bytes. Capabilities publish every limit. Do not add JSON output.

Migrate maintained smoke and public examples to the current command. Keep the legacy route until 0217. Do not change session storage, record formats, or pagination policy.

## Acceptance

Focused tests start red on the missing descriptor and dispatch. Rendered and raw readings match the retained behavior for format-3 direct entries and format-4 transactions. Pagination neither drops nor duplicates a logical entry. Version-1 cursors retain compatibility. Version-2 cursors retain their logical ordinal. Malformed requests fail before home access. Missing values, unknown or repeated options, invalid option combinations, and malformed or oversized cursors exit 2. Cursor snapshot, selection, offset, and ordinal conflicts exit 3. Missing homes, runs, stages, repeats, or sessions exit 1. Invalid record-controlled paths and integrity failures exit 5. Unexpected filesystem failures exit 4. Human and raw failures use bounded human diagnostics. A synchronous output failure returns exit 4 and never reports success. Tests cover every published limit, repeat listing, exact raw bytes, pagination, stale cursors, held path replacement, append behavior, help, and capabilities. Reuse underlying reader fixtures rather than duplicate them. Capabilities list the exact descriptor and limits without provider access. Smoke, guides, help, and active specification use the current command. Update the README only if it already teaches session reading. The legacy command remains available until 0217.

## Complexity

- Contract score: 2
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 7
- Minimum level floor: none
- Final level: 3
- Reasons: The command publishes a new name over a mature reader. Pagination and exact-byte modes need broad compatibility proof.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Design review: accepted 2026-09-11 at `af07ddf633f7f04dadba459e0feec52508a018df`. The first draft claimed an oversized-cursor contract that did not exist and left current failure mapping and output failures implicit. The first revision omitted the 10,000-line raw limit, the 1,000,000-line per-page scan limit, and the 2,048-byte error limit. The accepted revision names every limit and raises state and timing from 0 to 1 for snapshot, cursor, and exact-byte race proof. Routing remains level 3.
- Code review: accepted 2026-09-11 at `0e6b9f6faccdc35e437e4b3b8c2c98eb8a426663`. Independent review found stale smoke ownership, incomplete current-command allowlists, missing legacy-session guard forms, and a Markdown token-boundary escape. The final review observed both mechanical suites passing and found no production behavior defect.

## Size decision

- Starting production size: 19805 nonblank lines
- Ending production size: 19967 nonblank lines
- Simpler approach tried: Route the new name directly to the legacy session handler.
- Why insufficient alternatives were rejected: The legacy handler returns every reader failure as exit 1 and does not bound cursors before decoding. The current contract needs separate request, conflict, integrity, and filesystem exits. Copying the session reader would split ownership of pagination and exact raw reads.
- Production code deleted: 0 nonblank lines. Ticket 0217 retains the legacy route until final deletion review.
- Accepted cost: 162 production lines add the current parser and typed result adapter. Small cause fields expose the existing reader's result classes without changing legacy output or exit behavior. Cursor bounds now protect the shared decoder.
