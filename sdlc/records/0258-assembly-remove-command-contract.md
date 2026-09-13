---
base: a88a6889fc64c1146614d5c3016d82f433c6eec8
head: 7a65c7d892aa696e18c4106f180e10fb2ba40386
---

# Adopt the current assembly remove command

`bot assembly remove` now reports the exact copied or linked installation that it removed. It quarantines the selected target inside the assembly home before deletion and never removes the source or a neighboring installation.

Independent review required stronger retry, target-race, and lock-settlement evidence. The repairs serialize removal with other assembly mutations and retain enough intent to finish cleanup after interruption or lock-release failure.

The integrated local check passed 234 test files, 1,776 runtime tests, 143 conformance cases, and the complete static gate. GitHub Actions runtime run `34653401892` and documentation run `34653401888` passed on the published batch head.
