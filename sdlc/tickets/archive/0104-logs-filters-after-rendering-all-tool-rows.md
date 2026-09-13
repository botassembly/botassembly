---
flow: build
priority: 3
---
# Logs filters after rendering all tool rows

Promoted 2026-08-21 from
`sdlc/issues/0104-logs-filters-after-rendering-all-tool-rows.md`
(severity should-fix, filed by the 2026-08-20 observability review;
priority low at triage — cost, not correctness).

Narrow `logs` queries (`bot/src/one-run.ts:141-160`) read every
selected session, render every tool row, then parse the human
rendering to apply `--failed` and `--tool` — coupling filtering to
presentation and paying for rows the query discards.

Done, observably: filtering applies to structured tool-call rows
while they are read, never by parsing rendered text, and filtered
output for the same home is unchanged from today's. Whether a
settled-call index avoids opening irrelevant sessions is the
design's choice.
