---
base: f3bbafd545d96f4966fc3d1c975288754ee5602a
head: 9fe2dd83b4c93627658e4d6049a9841fa1aac323
---

# A run holds a lock on the worktree it works in

Landed per-stage liveness holders for the effective stage worktree. While a
stage runs, bot creates an owner-only `.bot-runs/` directory beneath that tree
and holds a `proper-lockfile` lock at
`.bot-runs/<sha256(record-path-and-stage-identity)>-<uuid>.lock`. The hash keeps
run and stage identity out of the shell-visible name; the UUID permits multiple
concurrent holders of the same tree.

`bot worktree <directory>` resolves the argument against its current directory
and exits 0 when any holder has a fresh mtime, otherwise 1. It writes neither
stream. Missing, unreadable, and stale holders are not live. The holder is
acquired immediately before stage preparation and released in `finally`, so
stage-specific `workdir` paths and faults use the same effective directory.
