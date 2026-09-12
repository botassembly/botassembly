---
base: a88a6889fc64c1146614d5c3016d82f433c6eec8
head: 7a65c7d892aa696e18c4106f180e10fb2ba40386
---

# Add the current model list command

`bot model list` now reports Pi's local provider and model catalog through bounded human and versioned JSON results. Optional live refresh keeps its separate network contract and honest pre-refresh and post-refresh status.

Independent review found that provider validation happened too late and dependency failures could expose raw error text or codes. The repairs validate first and emit only bounded stable diagnostics.

The integrated local check passed 234 test files, 1,776 runtime tests, 143 conformance cases, and the complete static gate. GitHub Actions runtime run `34653401892` and documentation run `34653401888` passed on the published batch head.
