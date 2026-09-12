---
base: 9ed89dcfea427531e4973d9c3928673f268744ff
head: 06075e61e91c283390551603bfa081c81b27f592
---

# Prune trusts process evidence before stealing a lock

Durable-run pruning now refuses removal when retained process-group evidence is
live, malformed, or unreadable. It rechecks that evidence after claiming the
run so a stale lock cannot permit removal of work still owned by a process.
