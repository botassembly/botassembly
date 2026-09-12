---
base: ab411f6152321a47f110c296013cc860e816f880
head: 9a46dbdb1d8e9e43985a5074741efa77a409d1ae
---

Subflow calls now carry cumulative chain depth and are withheld after the
tenth call, preventing mixed-flow recursion from spawning without bound.
Self-recursion keeps its authored `max-depth` behavior, while records report
the applicable call position and the specification documents the fixed ceiling.
