---
flow: build
priority: 10
completed: 2026-09-08
---
# Lifecycle provenance survives checkout umask

## Result

`expectProjectToMatchProvenance` now treats `executable: true` as the presence of any execute bit. It still rejects a script with no execute bits. The test copies the project into a temporary fixture before changing modes. One fixture sets all five lifecycle scripts to `0700` and verifies each mode. A second fixture sets `tasks` to `0600` and proves that provenance rejects it.

The existing canonical-commit, exact script-set, SHA-256 content, fork, and coordinated script-plus-manifest propagation assertions remain in place. The live project tree receives no chmod operation. Runtime code, lifecycle scripts, the provenance manifest, and tracked checkout modes remain unchanged.

## Finding and boundary

The source finding came from a fresh Git checkout under `umask 077`. Git materialized a tracked executable script as `0700`, but the old assertion required `(mode & 0o111)` to equal `0o111`. The owner could execute the script, but the test rejected the valid checkout because it observed `0100`.

The same issue file described a home-permission failure. That portion was stale: `db733b8d` already restores the requested broad mode before testing identity refusal. This ticket did not change the home tests.

## Review and checks

Commit `6e8da807` preserves the red proof before the assertion change. Under `umask 077`, `PATH=/home/ian/.nvm/versions/node/v22.22.3/bin:$PATH npm test -- --run tests/project-script-adoption.test.ts` reported 14 passing tests and one failing owner-only executable test. The failure reported `0100` received and `0111` expected.

Independent Sol review accepted ticket 0063 without findings.

The final focused command under `umask 077` passed all 15 tests. ESLint and all 29 custom lint-rule cases passed. `git diff --check` passed. The source ratchet passed at 16,022 of 16,022 nonblank production lines. The change has zero production-line delta.

The primary complete offline check ran under `umask 077` with Node 22.22.3 and passed. It ran 19 project tests, 210 runtime test files with 1,444 tests, and 143 of 143 conformance cases. Coverage reported 97.06 percent of production lines across 105 production modules. The source ratchet passed at 16,022 of 16,022 nonblank lines.

No live-provider test ran. `npm ci` reported three moderate advisories in the existing pinned dependencies; this ticket changed no dependency files.

## Size decision

- Starting commit: `2f19b0c0`, the current main baseline after manual ticket 0062
- Starting production size: 16022 nonblank lines
- Ending production size: 16022 nonblank lines
- Net increase: 0 nonblank lines
- Simpler approach: compare the execute-bit mask with zero and retain the existing boolean provenance assertion.
- Reason: Git records whether a tracked file is executable. Checkout umask controls the other permission bits and must not affect that fact.
- Accepted cost: two temporary fixture tests and one clearer boolean assertion.

## Source

This manual ticket absorbed the lifecycle portion of the offline-test issue. The issue is resolved and deleted with this record. Draft 0181 is next.
