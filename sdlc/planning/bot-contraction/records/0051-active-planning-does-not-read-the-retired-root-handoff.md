---
flow: quickfix
priority: 6
completed: 2026-09-06
---
# Active planning does not read the retired root handoff

## Result

The retired root handoff, its obsolete cold-review template, and the broken 2026-08 dogfood sweeper are gone. The SDLC README now names the surviving planning authorities and the dated-handoff convention. The punchlist no longer cites the retired file.

All 24 retained dogfood run-evidence files remain. Current ADRs, specifications, planning, tests, tickets, and records preserve the durable facts. Git preserves every removed artifact.

## Review and red-green evidence

The red repository check found the retired root handoff and its active readers. The corrected check rejects the file itself and active references from planning, live tickets, runtime source, scripts, and project executables.

Design review traced the removed material and found no unique current authority. Code review rejected the first guard because it excluded every live ticket. The remediation excludes only this cleanup ticket and includes a mutation proof that catches another live ticket which restores the dependency. Final review accepted it.

## Checks

Focused handoff tests passed 4 tests. Focused lint and `git diff --check` passed. The complete root `make check` passed with 19 project tests, 204 Bot test files, 1,355 Bot tests, 143 of 143 conformance cases, all 100 production modules in the coverage summary, and the unchanged 15,104-line production ratchet.
