---
base: 4fd0bc9eec950dba42ed297aac664a9e1ad1fb0b
head: 0184cfb43e064e715f0bc8ad4806b1e3376f5752
---

Bare prune now selects only provable garbage, preserving durable runs unless a
person names one or selects it with `--keep` or `--age`. The closed query
removes `--count` and `--refused`, preserves report-first deletion, and
rechecks liveness at every removal edge.
