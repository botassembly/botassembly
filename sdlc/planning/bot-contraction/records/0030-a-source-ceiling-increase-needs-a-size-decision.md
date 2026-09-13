---
flow: build
priority: 10
completed: 2026-09-06
---
# A source ceiling increase needs a size decision

## Result

The project lint ladder now refuses a production-source ceiling increase without one matching size decision in the manual ticket or record changed by the same Git comparison. The decision states the measured sizes, simpler approach tried, rejected alternative, production deletion, and accepted cost. The checker validates presence and arithmetic. Review still judges the reasoning.

The checker leaves the shared exact-count ratchet unchanged. It needs no historical decision for an unchanged or lowered ceiling. It fails closed when Git cannot supply the comparison.

## Review and red-green evidence

The first focused suite failed because the checker did not exist. Independent design review rejected ambiguous selection from the repository's many old tickets and protected the copied ratchet boundary. The corrected design uses only files changed with the working or committed ceiling increase.

Independent code review proved that `tickets/README.md` could satisfy the first implementation. Remediation restricted candidates to the workstream's numbered filename form and added working and committed regression cases. Re-review accepted the result.

## Size decision

- Starting production size: 15,174 nonblank lines
- Ending production size: 15,174 nonblank lines
- Simpler approach tried: enforce the existing README sentence through the unchanged exact-count ratchet
- Why insufficient alternatives were rejected: the shared ratchet owns source counting and must not learn this project's ticket layout
- Production code deleted: none
- Accepted cost: the project carries one Git-aware planning check and its focused fixtures

## Checks

Focused size-decision tests passed 11 of 11. Combined project-owned tests passed 14 of 14. The project lint ladder passed, including the unchanged 15,174-line ratchet, all static checks, dependency pins, and cycle detection. `git diff --check` passed. The final root `make check` result follows in the committing session.
