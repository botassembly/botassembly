---
base: a88a6889fc64c1146614d5c3016d82f433c6eec8
head: 7a65c7d892aa696e18c4106f180e10fb2ba40386
---

# Add the current authentication login command

`bot auth login` now delegates login and credential storage to Pi. The command bounds every interaction, keeps provider messages away from structured output, and reports only the safe credential type.

Independent review found that cancellation and synchronization failure could hide a credential that Pi had already saved. The repaired result reports persisted success before the bounded nonzero synchronization settlement. Tests cover real API-key and OAuth persistence plus Pi's authentication lock.

The integrated local check passed 234 test files, 1,776 runtime tests, 143 conformance cases, and the complete static gate. GitHub Actions runtime run `34653401892` and documentation run `34653401888` passed on the published batch head.
