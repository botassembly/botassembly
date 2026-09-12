---
base: 76b48dd9e36cd9f27a506188ad55c55cd8836fad
head: d08d2486e45ada59b04f8fc3ea792bce5f3c8f1d
---

Landed exact resolved `pwd`, `input`, `output`, `tmp`, and `skills` paths on every output-bearing `stage_start`, including gate retries.

The runtime carries the minted environment values through existing gating transport, leaves chooser records without slots, and documents the additive record contract. Coverage compares recorded paths with the gate environment on both attempts.
