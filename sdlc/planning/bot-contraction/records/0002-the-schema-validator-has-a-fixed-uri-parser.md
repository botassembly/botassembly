---
flow: quick-fix
priority: 10
completed: 2026-09-04
---
# The schema validator has a fixed URI parser

## Goal

Bot's installed dependency graph contains no known `fast-uri` host-normalization advisory.

## Result

The lockfile now selects `fast-uri` 3.1.7 through Ajv's existing compatible range. No direct dependency, source, schema behavior, or unrelated package changed. A clean install and `npm ls fast-uri --all` confirmed the resolved version. `npm audit --json` reported zero vulnerabilities.

The independent design review and independent code review both returned ACCEPT with no material findings.

## Checks

Focused schema checks passed 69 tests. The final `make check` passed 164 test files and 988 tests, 142 of 142 conformance cases, lint, catch-budget inspection, type checking, unused-code inspection, cycle detection, the exact source ratchet, and direct dependency pins.
