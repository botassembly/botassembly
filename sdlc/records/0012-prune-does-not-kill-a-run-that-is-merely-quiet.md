---
base: 488a37d5592f25ab2483683f2892a5b68e794344
head: 20c8a8d5ee7e3bba1e3b7fd64d52634cc03964fa
---

Landed conservative prune handling for physical run locks: selected locked runs are reported and preserved regardless of lock mtime, unless the explicit `--refused` override is supplied.

The change prevents a quiet live run from losing its evidence while preserving unlocked pruning and orphan-lock cleanup.
