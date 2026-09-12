---
base: f2f0cd12b11cfe80a012fa91d62fbeae4628a8f4
head: c5a3d2fb5987391dcb682bce40e3dc3a53d19b15
---

Landed clearer human `bot show` readings: sealed stage output is labeled as the agent report, while passing and failing gate checks are rendered separately as authoritative gate verdicts.

The record and `bot output` byte surfaces remain unchanged, so agent prose cannot be read as the gate's result in the human rendering.
