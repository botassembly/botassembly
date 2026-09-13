---
base: 44e6d48f557f17d2fc26d9daf97f2b130d0edeca
head: 732856a34c6444237223df8e82e720aa13266e45
---

A rejected provider-retry record append escaped its detached promise, leaving
the stage hung. Retry failures now become terminal stream errors so existing
stage fault handling seals the failure. A regression test covers the path, and
the source ratchet reflects the change.
