---
base: 0d48a3e245eb68b9d2f1ea77882a13fa20eb2d66
head: e70ef328120df558712723745de01492b63571b0
---

Landed per-run hashed provider session identities, retaining flow, stage, and repeat so retries in one stage attempt keep cache affinity. Concurrent runs of the same stage now receive distinct provider cache and diagnostic identities.

Focused runner coverage executes two concurrent runs with distinct run records, while provider-retry coverage confirms a zero-token retry sequence keeps one nonempty session identity. The obsolete collision issue is removed.
