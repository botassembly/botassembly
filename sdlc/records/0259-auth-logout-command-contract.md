---
base: a88a6889fc64c1146614d5c3016d82f433c6eec8
head: 7a65c7d892aa696e18c4106f180e10fb2ba40386
---

# Add the current authentication logout command

`bot auth logout` now asks Pi to remove only the selected provider credential. The result states that Pi completed the operation. It does not claim that a stored credential existed or that ambient authentication disappeared.

Independent review rejected a private Bot credential writer and the general runtime because it could refresh credentials before deletion. The accepted implementation creates a no-refresh Pi runtime and keeps Pi's lock, mutation, and typed synchronization ownership.

The integrated local check passed 234 test files, 1,776 runtime tests, 143 conformance cases, and the complete static gate. GitHub Actions runtime run `34653401892` and documentation run `34653401888` passed on the published batch head.
