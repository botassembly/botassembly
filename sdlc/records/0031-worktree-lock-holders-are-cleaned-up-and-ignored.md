---
base: 9a7e425ce2d4b231d6cfb3de70522e7f9cf247a3
head: 0f3ff1ca00378d5eb18da00581c55379f426501d
---

# Worktree lock holders are cleaned up and ignored

Landed home-owned worktree holders keyed by the effective worktree path. A
completed stage removes its holder, while `bot worktree` sweeps stale holders
and never treats a missing worktree as live.

Holders no longer create `.bot-runs` entries in caller worktrees, so a clean
does not compromise a live run. If a holder is compromised, the run records a
named machinery fault rather than throwing uncaught.
