---
flow: quickfix
priority: 10
completed: 2026-09-06
---
# Complete check isolates inherited machine state

## Result

The root-check contract test now removes recursive Make control variables from its child process while preserving every unrelated environment value and the exact two-recipe assertion. Conformance cases now read their own checked-in Bot homes. Static PARALLEL fixtures create and use their own home. Personal model configuration can no longer make these tests pass.

Twenty-two accepted conformance outputs now record their fixture-owned `faux` provider and `faux-1` model. Refusal outputs, invocations, the conformance ledger, runtime behavior, the root Makefile, and the runtime workflow did not change.

## Review and red-green evidence

Hosted run `34036125983` first exposed recursive Make directory diagnostics. `MAKEFLAGS=w` reproduced the failure locally. Independent review kept the exact assertion and removed `MAKEFLAGS`, `MFLAGS`, and `MAKELEVEL` from only the nested Make environment.

Hosted run `34037407280` passed that repair and exposed 38 conformance failures plus two PARALLEL failures on a clean home. A hostile local Bot home reproduced the leak. Independent review traced every failure to tests that passed ambient `process.env` into the reader. Remediation bound each fixture to its own home. Review audited all 22 changed expected files and confirmed that only the leaked provider and model facts changed.

## Checks

Normal, empty-home, and hostile-home focused runs passed all 143 conformance cases and seven focused tests. Recursive-Make tests passed two of two. The complete local `make check` passed with 18 project tests, 202 Bot test files, 1,343 Bot tests, 143 of 143 conformance cases, and the unchanged 15,106-line production ratchet. Hosted runtime run `34038403153` passed the complete offline check from a fresh non-root checkout.

One earlier local complete check found an intermittent process-test probe that did not observe a shell before its 20-millisecond timeout. Its focused rerun and the next complete check passed. This ticket did not hide or repair that separate test race.
