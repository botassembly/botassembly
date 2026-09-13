---
flow: quickfix
priority: 10
completed: 2026-09-06
---
# The repository has one complete check

## Result

Root `make check` now runs the existing project lint and test ladders. It covers generated documentation, specification checks, static rules, documentation tests, Bot tests, conformance, dependencies, cycles, and the production-source ratchet. Bare `make` remains help. Smoke and packaging remain separate.

ADR 0027 records Ian's decision to replace the old split entry point. The root coordinates the existing ladders and owns no check implementation.

## Review and red-green evidence

Before the change, root `make check` failed because the target did not exist. The first implementation made the documentation mutation test call the complete check. Independent code review reproduced the resulting recursion failure when the test inherited the check sentinel.

Remediation restored the real lint mutation and added a dry-run composition test. The project test ladder now runs the documentation tests and the Bot tests. Independent review accepted the narrow sentinel exemption used only by the child lint mutation.

## Size decision

- Starting production size: 15,174 nonblank lines
- Ending production size: 15,174 nonblank lines
- Simpler approach tried: reuse the existing project ladders without moving their checks
- Why insufficient alternatives were rejected: the former split entry point omitted project-level documentation checks from the command contributors called complete
- Production code deleted: none
- Accepted cost: documentation-only tickets now run the full offline repository check before completion

## Checks

The first root `make check` run found one failure in an existing raw-record backpressure test. That focused file immediately passed all 24 tests. A second root `make check` passed. Documentation tests passed 3 of 3. Bot passed 201 test files and 1,331 tests. Conformance passed 143 of 143 cases. Static rules, type checking, unused-code inspection, cycle detection, the 15,174-line ratchet, exact dependency pins, and `git diff --check` passed. Bare `make` printed help without starting the live ladder.
