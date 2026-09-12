---
base: ce68542b3c89674e8e1c9e3cd5568aac2f9ec921
head: 1281567128a545431c4910cfa4a6072add7db12c
---

Landed runtime provenance on every top-level and subflow `run_start`: executing checkout identity when available, exact lockfile SHA-256, Node version, and the resolved provider adapter identity.

The runtime resolves the facts once at run start and passes the immutable value to child records; non-checkout environments explicitly record an unknown source and null digest. Coverage proves the executing checkout, lockfile-byte change, and child propagation.
