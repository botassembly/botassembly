---
flow: build
priority: 5
---
# Prune never sweeps stale worktree holders

Promoted 2026-08-21 from
`sdlc/issues/0107-prune-never-sweeps-stale-worktree-holders.md`
(severity should-fix, filed by the 2026-08-20 observability review).

A crashed stage leaves its random worktree-holder lock behind, and
stale holders are cleaned only when that exact worktree is queried
(`bot/src/inspection.ts:95-116`), while `bot prune` never examines
`home/worktrees` (`bot/src/prune-inspection.ts:243-248`). Abandoned
holder locks and keys grow without bound — debris nothing reports.

Done, observably: `bot prune` removes stale holder locks and then
empties holder-key directories, a live holder is never touched, and
a home littered with crashed-stage holders comes out clean.
