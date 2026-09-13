---
flow: build
priority: 8
completed: 2026-09-05
---
# Run list is a composable reading

## Result

`bot run list` now gives people a bounded Markdown table by default and gives programs one versioned JSON envelope through `--json` or `-j`. The JSON result separates `state`, `exit`, and `cause`. Empty valid results exit successfully.

The command supports repeatable assembly, flow, state, and cause filters; canonical UTC millisecond `since` and `until` bounds; field projection; count-only mode; and bounded keyset pages. OR applies within one repeated filter. AND applies across filter types. A cursor freezes run-directory membership at one boundary and binds the resolved home by hash. Facts inside live records may change between pages.

One shared run-state reader now serves both new and legacy lists. It omits a live recordless directory, reports a dead recordless directory, preserves record faults, distinguishes a prefix without `run_start`, reports terminal runs, and uses the lock to distinguish a started running record from a crashed one. The legacy renderer projects that shared fact into its historical output and remains byte-for-byte unchanged.

Human table cells and errors render controls visibly, escape Markdown and HTML syntax, and obey byte limits. Every clipped cell contributes a bounded warning. JSON preserves accepted facts exactly. Count mode retains numeric totals plus at most 20 warnings and reports the exact omitted count.

## Bounds and errors

Repeatable filters accept at most 64 values and 2,048 UTF-8 bytes. Cursors accept at most 8,192 encoded bytes and 6,144 decoded bytes. Strict canonical JSON decoding rejects malformed base64url, UTF-8, JSON, shape, version, digest, state, cause, ordering, uniqueness, time, and bound violations before membership comparison. Canonical time input uses `YYYY-MM-DDTHH:mm:ss.sssZ` for years 0100 through 9999.

Markdown cells use at most 480 UTF-8 bytes, rows at most 4,096 bytes, and pages less than 1 MiB. Human failures use one inert physical line at most 2,048 bytes. A missing home is a typed not-found result. A file-valued, inaccessible, or malformed home or runs entry receives the matching typed filesystem result.

## Review and red-green evidence

The first red tests showed `bot run list` entering legacy run dispatch and `-j` diverging from `--json`. The initial implementation passed 11 behavior groups but independent code review reproduced unbounded unusable cursors, unbounded count warnings, a live-birth state error, unsafe Markdown and stderr, fractional timestamp errors, and invalid home handling.

Remediation added explicit filter and cursor bounds, streaming count, one shared state reader, inert rendering, canonical timestamps, and path-kind validation. A second review found unreachable running and crashed states, YAML cursor expansion, incomplete clipping diagnostics, and unsafe backslash-plus-pipe input. Strict JSON parsing and the corrected state and rendering rules closed those findings.

The final review found missing semantic validation inside otherwise canonical cursors and one early return that lost presentation warnings. Mutation tests now prove malformed cursor values win over simultaneous membership conflicts. One row can contribute record, oversized-summary, and clipped-cell warnings. The last focused mutation applies the exact digest rule to both home and membership hashes.

## Cost and deferred work

Production source grew from 13,646 to 14,210 nonblank lines. A closed query parser, bounded structured reader, small command adapter, and shared state helper own the 564-line increase. `cli.ts` and help receive narrow routing changes. The existing `bot runs` handler remains separate to preserve its live output and usage mode during migration.

Continuation relists run names and hashes membership. Exact count scans bounded record summaries. Neither operation reads sessions, outputs, requests, checks, captures, or usage detail. Capability discovery, correlation recording, other noun commands, caller migration, and legacy deletion remain separate work.

## Checks

The complete gate passed all 194 test files and 1,247 tests, including 143 of 143 conformance cases. Lint and all 29 lint mutation probes passed. Type checking, catch-budget enforcement, unused-code inspection, cycle detection, exact dependency pins, the 14,210-line source ratchet, specification checks, and `git diff --check` passed.
