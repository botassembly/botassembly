---
base: 10975e57aa9626584c20849740830f9beb26498e
head: 4cff3c97bcea7ced788fe8059ba0f1f0381f2e45
---

The inspection read-error regression is covered for directory-shaped files
named by a run record. `output`, `session`, and `logs` preserve their existing
missing-file answers through the shared safe reader instead of exposing a
filesystem error.
