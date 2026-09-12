---
base: 820318838d86585fa9cccc8c166767a7aeb21863
head: f526e49045d9007d2d220935a003a42b8419481a
---

# Gate Pages deployment behind an opt-in

The documentation workflow now builds on every matching run and deploys only when `PUBLISH_PAGES` is set to `true`. Publication permissions remain confined to the deploy job. Local `make check` passed with 71 repository tests and 1,524 runtime tests. GitHub Actions run `34525685945` built the documentation and skipped deployment. Runtime run `34525685733` passed.
