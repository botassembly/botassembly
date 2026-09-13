---
base: a88a6889fc64c1146614d5c3016d82f433c6eec8
head: 7a65c7d892aa696e18c4106f180e10fb2ba40386
---

# Import the retired Bot authentication store

`bot auth import SOURCE` now copies one complete compatible retired credential map into a missing or empty Pi authentication file. It never merges, overwrites, selects, changes, or prints credentials.

Pi has no public whole-store import API. This command is the one approved Bot-owned migration. Independent review required exact command grammar, source and destination trust checks, both lock identities, atomic publication, honest result settlement, and bounded cleanup. The final implementation passed 64 focused ownership cases and the repository's exact exception checks.

The integrated local check passed 234 test files, 1,776 runtime tests, 143 conformance cases, and the complete static gate. Production source ended at exactly 19,660 nonblank TypeScript lines. GitHub Actions runtime run `34653401892` and documentation run `34653401888` passed on the published batch head.
