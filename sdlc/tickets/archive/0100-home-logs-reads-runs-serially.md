---
flow: build
priority: 3
---
# Home logs reads selected runs serially

Promoted 2026-08-21 from `sdlc/issues/0100-home-logs-reads-runs-serially.md`
(severity minor, filed by the 2026-08-20 observability review).

Home-wide `bot logs` (`bot/src/one-run.ts:170-180`) waits for each
run's record and session set before reading the next, so with the
default bound of 20 or `--all`, wall time is the sum of independent
reads.

Done, observably: selected runs are read concurrently under a
bounded pool, rows and diagnostics still appear in input order, and
the command's output is byte-identical to today's for the same home.
