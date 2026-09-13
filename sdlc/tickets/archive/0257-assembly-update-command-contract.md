---
flow: build
priority: 1
deps: [0255]
---
# Assembly update uses the current command contract

## Outcome

Assembly update uses the current dispatcher and reports complete, partial, and unchanged batch results honestly.

## Current facts

A bare update processes installed assemblies in sequence. Earlier assemblies can change before a later update fails. The legacy command has no finite machine-readable partial-result contract.

## Scope

Adopt the existing update owner. Add one current descriptor with no alias. Preserve source filtering, replacement, interruption, and per-assembly atomic publication. Preserve useful human output.

Version-1 JSON contains ordered per-assembly outcomes with `name`, `state`, and a bounded safe reason. `state` is `updated`, `unchanged`, or `failed`. Before any mutation, compute the worst-case encoded result from the selected installation names and the fixed per-reason bound. Refuse the whole request when that result could exceed the command's declared result-byte limit. Do not paginate a mutation result. The command exits nonzero when any item fails and still reports every settled earlier outcome. It stops after the first failure unless the existing owner already guarantees safe continuation.

Do not remove installations or make the whole batch transactional.

## Acceptance

Tests cover one update, unchanged state, missing and invalid sources, several successful updates, a failure after an earlier success, preflight refusal before an oversized batch, interruption during replacement, human and JSON output, bounds, exit codes, and the capability row. A partial batch never reports complete success.

## Dependencies

0255 supplies the current assembly mutation family and creation result rules.

## Complexity

- Contract score: 2
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 9
- Minimum level floor: level 4 for partial batch replacement and recovery
- Final level: 4
- Reasons: One command can replace several durable installations before a later failure. The result must match partially committed state exactly.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if the implementation can make the whole batch atomic without widening storage guarantees.

## Review

- Design review: accepted 2026-09-11
- Code review: accepted 2026-09-11 after remediation; the initial review rejected unlocked selection and result feasibility, a missing exact current command-matrix row, and a wall-clock overlap-test branch

## Size decision

- Starting production size: 18264 nonblank lines
- Ending production size: 18293 nonblank lines
- Simpler approach tried: Keep update selection outside the shared claim and recheck only the result size after acquiring it.
- Why insufficient alternatives were rejected: A second selection could disagree with the names used to compute the report bound. One locked selection must own both feasibility and mutation.
- Production code deleted: None. The change moves selection into the existing locked update path and adds narrow boundary plumbing and missing-home cleanup.
- Accepted cost: 29 nonblank production lines make selection, report feasibility, and mutation one claimed operation while preserving typed partial and post-publication settlement.
