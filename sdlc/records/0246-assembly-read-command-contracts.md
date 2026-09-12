---
base: a88a6889fc64c1146614d5c3016d82f433c6eec8
head: 7a65c7d892aa696e18c4106f180e10fb2ba40386
---

# Adopt current assembly read commands

`bot assembly check` and `bot assembly list` now use explicit current command contracts. Both commands expose bounded human and versioned JSON results through help and capabilities.

Independent review found incomplete argument rejection and command publication coverage. The repairs reject stray input, preserve declared assembly slots, and prove the public command matrix.

The integrated local check passed 234 test files, 1,776 runtime tests, 143 conformance cases, and the complete static gate. GitHub Actions runtime run `34653401892` and documentation run `34653401888` passed on the published batch head.
