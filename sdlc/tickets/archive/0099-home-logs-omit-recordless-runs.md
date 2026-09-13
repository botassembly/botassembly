---
flow: build
priority: 5
---
# Home logs omit record-less runs

Promoted 2026-08-21 from `sdlc/issues/0099-home-logs-omit-recordless-runs.md`
(severity should-fix, filed by the 2026-08-20 observability review).

`homeRows()` (`bot/src/one-run.ts:170-180`) silently continues when
a run has no record to read. A home-wide filtered log can therefore
report no matching calls after skipping a run it could not inspect —
unlike the per-run command and `bot runs`, which both say so. A
reader cannot tell "nothing matched" from "something was unreadable".

Done, observably: home-wide `bot logs` emits the same
`Run <id> has no record to read.` diagnostic the per-run command
emits for each run it skips, while stdout stays limited to tool
rows. The behavior being replaced is only the silent skip.
