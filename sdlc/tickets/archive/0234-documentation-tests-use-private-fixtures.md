---
flow: build
priority: 1
---
# Documentation tests use private fixtures

## Outcome

Documentation generator tests never edit the repository checkout and remain safe under concurrent test workers.

## Current facts

Two tests rewrite `skills.md` or create `docs-drift-proof.md` in the shared checkout. Another test process can observe those temporary bytes.

## Scope

Give the generator an explicit private root for tests. Copy only required fixture inputs into a temporary directory. Keep production generation unchanged.

## Acceptance

Tests prove hostile unmapped files and changed generated pages in private fixtures. Concurrent documentation tests and the complete check pass without tracked-file changes.

## Dependencies

None.

## Risk facts

The defect is a concurrency race. The test seam must not create a second production path.

## Complexity

- Contract score: 0
- State and timing score: 2
- Reach score: 1
- Proof score: 1
- Cost of error score: 1
- Total: 5
- Minimum level floor: level 3 for concurrency
- Final level: 3
- Reasons: Concurrent test workers can observe temporary source bytes. One private root must cover every generator test while production keeps one generation path.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Design review: accepted; one explicit repository root keeps production and tests on the same generation path
- Code review: accepted after adding lint-wiring proof and separating the fixture root from the child working directory
