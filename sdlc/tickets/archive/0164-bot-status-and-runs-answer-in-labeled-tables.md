---
flow: build
priority: 3
---
# Bot status and runs answer in labeled tables

`bot runs` prints real columns with no header row, raw ISO
timestamps, and raw token counts; `bot status` prints one line of
six key-value pairs with raw byte counts
(`bytes 2052819518`). Correct and spartan; ADR 0022 now sets the
rendering bar and this ticket brings the two most-read listings up
to it.

Done, observably:

- `bot runs` renders a labeled table: a header row naming run id,
  assembly, flow, started, outcome, and tokens; aligned columns;
  right-aligned numbers; humanized ages and token counts; run ids
  and outcomes verbatim.
- `bot status` renders labeled lines with humanized magnitudes
  (`2.1 GB`, not `2052819518`), exact values unchanged in any
  `--json` form the verb offers.
- One shared formatting helper renders both, placed so the other
  readings can adopt it in later tickets without new machinery.
- No answer changes content: a test pins that every field printed
  today is still printed, and any `--json` output is byte-stable
  across the change.

Boundary: rendering only. No flags change, no verbs are added, the
other readings (`show`, `logs`, `session`, `prune`) are later
tickets.
