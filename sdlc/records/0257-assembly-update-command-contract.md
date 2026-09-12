---
base: a88a6889fc64c1146614d5c3016d82f433c6eec8
head: 7a65c7d892aa696e18c4106f180e10fb2ba40386
---

# Adopt the current assembly update command

`bot assembly update` now reports ordered updated, unchanged, and failed outcomes through bounded human and versioned JSON results. A batch reports earlier committed changes when a later update fails.

Independent review found that selection and validation happened outside the assembly mutation lock. The repair claims the lock before selection and holds it through publication and result settlement. A deterministic concurrency proof replaced a timing-sensitive first test.

The integrated local check passed 234 test files, 1,776 runtime tests, 143 conformance cases, and the complete static gate. GitHub Actions runtime run `34653401892` and documentation run `34653401888` passed on the published batch head.
