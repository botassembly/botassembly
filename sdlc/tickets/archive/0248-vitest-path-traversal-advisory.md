---
flow: build
priority: 1
---
# Vitest uses the patched test-only release

## Outcome

The locked test toolchain no longer contains the reported mock-redirect path-traversal vulnerability.

## Current facts

`npm audit` reports one advisory, GHSA-82fw-gwwq-j7x9, through three dependency nodes: Vitest 4.1.10, `@vitest/mocker`, and `@vitest/coverage-v8`. The affected range ends before 4.1.11. Vitest and `@vitest/coverage-v8` are direct development dependencies.

## Scope

Move the two exact direct pins to 4.1.11 together and refresh the lockfile. Align every installed `vitest` and `@vitest/*` package at 4.1.11 without adding transitive packages as direct dependencies. Change no production dependency, production lock record, or test behavior. Use Node 22.22.3 and npm 10.9.8. The ordinary lock-only command currently crashes in npm's optional-peer resolver. Use `npm install --package-lock-only --ignore-scripts --legacy-peer-deps`, then prove that an ordinary clean `npm ci` succeeds.

## Acceptance

Both direct manifest pins and both lockfile root pins equal 4.1.11. `@vitest/mocker` and every installed Vitest-family package equal 4.1.11. Production dependencies and non-development lock records remain unchanged. Pinned-dependency checks and an ordinary `npm ci` pass. The complete offline check passes. `npm audit --json` reports no instance of GHSA-82fw-gwwq-j7x9 even if an unrelated advisory exists.

## Dependencies

None.

## Risk facts

The package is test-only. The advisory reports arbitrary file reads through mock redirects during development or test execution.

## Complexity

- Contract score: 0
- State and timing score: 0
- Reach score: 1
- Proof score: 1
- Cost of error score: 2
- Total: 4
- Minimum level floor: level 4 for a credible security exposure
- Final level: 4
- Reasons: The direct edit is small, but the lock refresh must remove the named file-read exposure without changing the production dependency graph or splitting the Vitest family across versions.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Design review: accepted after the ticket required one aligned Vitest family, stable production lock records, named-advisory proof, ordinary clean install, and level-4 routing
- Code review: accepted; exactly two direct pins and nine Vitest-family lock records moved to 4.1.11 while every production record stayed unchanged
