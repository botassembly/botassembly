---
base: a88a6889fc64c1146614d5c3016d82f433c6eec8
head: 7a65c7d892aa696e18c4106f180e10fb2ba40386
---

# Add the current authentication list command

`bot auth list` now reports safe provider metadata through bounded human and versioned JSON results. It reports stored credentials as `stored` and every other provider as `unobserved`.

Independent review showed that Pi's broader status calls can resolve secrets, inspect provider files, or run configured commands. The accepted implementation reads public credential metadata once and never probes authentication. The cost is less detail for providers without a stored credential.

The integrated local check passed 234 test files, 1,776 runtime tests, 143 conformance cases, and the complete static gate. GitHub Actions runtime run `34653401892` and documentation run `34653401888` passed on the published batch head.
