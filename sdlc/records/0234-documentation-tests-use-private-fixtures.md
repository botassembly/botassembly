---
base: c814ed0085a0043ac80f3ee8ba4924ac60f6e541
head: 5f749be3c9e6ec230303a20a6fa6c59fd9e041e7
---

# Isolate documentation generator tests

The documentation generator accepts an explicit repository root while production still derives the real root from the script path. Each generator test now creates and removes its own temporary repository. The tests run outside that repository to prove the explicit root controls every read and write. A lint integration assertion preserves proof that the project lint gate invokes the generator.

The first independent code review rejected the change because it had lost the lint-wiring proof and used the fixture root as the child working directory. The remediation added both proofs. The second review accepted the result with no findings.

Local `make check` passed with 71 repository tests, 1,524 runtime tests, and 143 conformance cases. GitHub Actions runtime run `34527878938` passed. Documentation run `34527878958` built successfully and skipped deployment.
