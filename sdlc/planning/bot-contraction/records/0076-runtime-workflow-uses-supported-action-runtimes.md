---
flow: quickfix
priority: 4
completed: 2026-09-10
---
# The runtime workflow uses supported action runtimes

## Result

The read-only runtime workflow now pins `actions/checkout` v7.0.1 and `actions/setup-node` v7.0.0 to their reviewed 40-character commits. Both actions declare Node 24 as their own runtime. Bot still runs on Node 22.22.

The workflow kept its triggers, read-only permission, Ubuntu runner, two-commit checkout, disabled credential persistence, npm cache, pinned dependency installation, non-root proof, parent proof, and root complete check. The existing static contract now requires the new commits and release comments. Its mutation table rejects both old commits and mutable action tags. The privileged documentation workflow did not change.

## Complexity and review

The design scored 2 and level 1. One read-only workflow owns the reversible change. A bad pin can stop hosted checks but cannot change product or data. Luna High implemented the ticket. Separate Sol Medium agents reviewed the design and code.

Design review found that GitHub publishes the forced-runtime warning as a check-run annotation rather than a normal job-log line. The revised ticket required a successful exact-head check-run with no matching annotation. Code review accepted the two-file implementation without findings.

## Checks

The red focused test rejected the old pins. The implementer, code reviewer, and primary agent ran `node --test scripts/runtime-workflow.test.mjs` under Node 22.22.3. All three tests passed. The implementer and primary agent ran root `make check` under Node 22.22.3. The primary check passed 42 project tests, 212 runtime test files with 1,466 tests, all 143 conformance cases, and the coverage gate. The verifier reported 102 production modules. Line coverage was 97.05%. The production source ratchet remains 15,995 of 15,995 nonblank lines.

Official tag records map checkout v7.0.1 to `3d3c42e5aac5ba805825da76410c181273ba90b1` and setup-node v7.0.0 to `820762786026740c76f36085b0efc47a31fe5020`. Their pinned manifests declare Node 24. Hosted runtime run `34437038352` passed on exact implementation commit `761bc698b948d384ea00c2ce9e79e2e048ddfa2d`. Check-run `102744173371` had zero annotations and zero deprecated or forced Node 20 warnings.

## Source

This manual ticket consumes draft 0226 and started from published commit `579bf6300308a8de225c5396f624200e74e95f65`. Commit `761bc698` implements the accepted behavior. Draft 0229 is next under Sol Medium, subject to a fresh premise review.
