---
base: a88a6889fc64c1146614d5c3016d82f433c6eec8
head: 7a65c7d892aa696e18c4106f180e10fb2ba40386
---

# Adopt current assembly creation commands

`bot assembly install` and `bot assembly link` now use explicit current command contracts. Each successful result identifies the published assembly, its installation kind, and the completed state change.

Independent review required stronger command publication and lock-settlement proof. The repairs serialize assembly mutations and preserve an already published success when lock release later fails.

The integrated local check passed 234 test files, 1,776 runtime tests, 143 conformance cases, and the complete static gate. GitHub Actions runtime run `34653401892` and documentation run `34653401888` passed on the published batch head.
