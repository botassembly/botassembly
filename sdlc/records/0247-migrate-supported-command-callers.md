---
base: cca335a553ea395a6e53676a3c1877f71e422b30
head: a13c663031d74f811e224ff2ce1825e3aa75abdb
---

# Migrate supported command callers

Maintained lifecycle scripts, smoke checks, examples, documentation, and specification examples now use the current assembly, model, authentication, run, and home command forms when an equivalent exists. Full-record and child-record reads still use `bot show`. Flat-only operations remain until the project accepts a replacement or retirement decision. The retirement ledger records each retained operation and its release condition.

An inventory-based guard now rejects old supported spellings in maintained prose and executable callers. The guard covers shell text and argv arrays. It excludes append-only history, active planning evidence, explicit compatibility sections, compatibility tests, and sealed captured assembly evidence. Lifecycle tests prove the exact quiet home-busy probe, both answer exits, and empty output.

Independent review found incomplete inventory coverage, inaccurate replacement claims, broad exemptions, missed argv arrays, and stale authentication guidance. The repair rounds narrowed every exemption and named the exact commands that can warn about authentication. Hosted checks exposed a separate clean-environment bug in `assembly check --home`: parsing selected the explicit home, but model resolution still used the ambient environment. The final repair uses the selected home only for invocation parsing and keeps it separate from assembly slots.

The complete local check passed 117 repository tests, 1,777 runtime tests across 234 files, 143 conformance cases, all 34 custom probes, lint, type checking, dead-code checking, cycle checking, dependency pins, and the production-size ratchet. Coverage reported 91.23% statements, 84.71% branches, 93.79% functions, and 96.47% lines. Production source remained at 19,660 nonblank TypeScript lines. GitHub Actions runtime run `34662159250` passed on the published head. Documentation run `34660459136` passed after the maintained documentation migration. Two earlier full local runs encountered load-sensitive timeouts in existing boundary tests. Both focused test sets passed, and the final complete local run passed without either timeout.
