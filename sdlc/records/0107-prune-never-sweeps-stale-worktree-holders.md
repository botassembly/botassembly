---
base: f4aa4774078a8601df9cb3434d10aa09e226909d
head: cf4f2c30b34ac68693446579e13da6a28e88e8bc
---

Landed stale legacy worktree-holder cleanup in `bot prune`, with its required
specification changelog entry. Prune reports and removes dead holder locks,
removes an empty holder key, and leaves a live holder intact.
