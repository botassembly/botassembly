---
flow: build
priority: 5
completed: 2026-09-10
---
# Every workflow reference and permission has one repository policy

## Result

One local test now inventories the complete `.github/workflows` directory. It requires exactly `docs.yml` and `runtime.yml`, all six direct action references at their reviewed commits, all three declared permission maps, and the two jobs that must inherit permissions without overrides.

The validator walks every object and array instead of checking only today's step positions. Twenty-two in-memory mutations prove rejection of added or removed workflows, missing or changed actions, local and Docker actions, reusable workflows, added steps, and every named permission drift. The two focused workflow tests remain unchanged. Future approved workflow changes must update both the owning focused test and this repository-wide inventory. That repeated edit is the accepted cost of one complete review point.

## Complexity and review

The design scored 5 and level 2. The proof spans every workflow file and direct reference, but the change adds only a local static guard. It changes no deployed workflow, runtime state, product behavior, or data. Luna High implemented the ticket with high reasoning. Separate Sol Medium agents reviewed the design and code. Both reviews accepted without findings.

## Checks

The red scaffold failed with `workflow policy validator not implemented`. The implementer, code reviewer, and primary agent ran the focused policy test and all three workflow tests under Node 22.22.3. All nine tests passed. The implementer and both reviewers confirmed that all 22 hostile mutations fail the same validator used for the live files.

The implementer, code reviewer, and primary agent ran root `make check`. The primary complete check passed 48 project tests, 212 runtime test files with 1,466 tests, all 143 conformance cases, and the coverage gate. The verifier reported 102 production modules. Line coverage was 97.05%. The production source ratchet remains 15,995 of 15,995 nonblank lines.

Hosted runtime run `34446685791` passed on exact reviewed commit `c1ab7c1fbd331e40228bee778340722cd047b6b7`. The documentation workflow did not run because this ticket changed no documentation, specification, or documentation workflow file. Ticket 0078 already proved the hosted documentation build and artifact for draft 0229.

## Source

This manual ticket started from published commit `1b2ed8d5469ec40294f3155d3a232179e889578c`. Commits `3e033995` and `82e8ae3d` record the drafted and accepted design. Commit `a8611e72` implements the policy. Commit `c1ab7c1f` records accepted code review and is the exact hosted implementation head. This ticket completes source draft 0229. Draft 0225 is next.
