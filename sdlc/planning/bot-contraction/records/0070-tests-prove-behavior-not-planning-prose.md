---
flow: build
priority: 4
completed: 2026-09-09
---
# Tests prove behavior, not planning prose

## Result

Runtime tests no longer read planning documents, ADRs, handoffs, or the SDLC README to enforce their wording. The retained tests still prove compiled behavior, published specification facts, conformance facts, generated help, changelog facts, and executable project scripts.

The test lint configuration now rejects direct string and template literals that name `sdlc/planning` or `sdlc/README.md`. It permits the executable `sdlc/project` and `sdlc/scripts` trees and the published specification. The lint probes preserve both sides of that boundary.

A separate executable-surface test keeps the retired root handoff absent and rejects references to it from runtime source, Bot scripts, documentation scripts, project scripts, and SDLC scripts. It reads no planning prose.

## Complexity and review

This was level 2 because the removal crossed lint configuration and four test areas. Luna High implemented it. Sol Medium designed the boundary and reviewed the result.

Sol found that Luna's first version deleted the useful executable-surface guard together with the prose assertions. Luna restored that guard as a focused test without restoring the wording checks. Sol accepted the remediation.

## Checks

The implementation established red with two forbidden planning-path probes before the rule existed. The 34 final lint probes passed. The focused edited tests passed 27 checks. The restored executable-surface test passed.

The primary agent added one direct planning-path literal to a test. ESLint failed with exactly `Tests must not pin planning prose or the SDLC README`. The agent removed the literal and reran the focused lint green.

The complete offline check passed 42 project tests, 211 runtime test files with 1,450 tests, all 143 conformance cases, and the coverage gate for 105 production modules. No runtime source changed, so the source ratchet remained 16,056.

## Source

This manual ticket consumes draft 0216. Draft 0215 is next under Luna High.
