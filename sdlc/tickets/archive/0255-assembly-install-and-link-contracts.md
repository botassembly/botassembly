---
flow: build
priority: 1
deps: [0246]
---
# Assembly install and link use current contracts

## Outcome

Assembly install and link use the current dispatcher, help, capabilities, and finite versioned results.

## Current facts

Both operations create a named installation through the same collision and destination owner. Install copies or downloads source content. Link records a local source link. The existing owner refuses collisions and never overwrites. The legacy dispatcher has no finite structured result that states what it published.

## Scope

Adopt the existing creation owner. Add explicit current descriptors with no aliases. Preserve naming, collision, path, source filtering, download, and atomic publication rules. Preserve useful human output. Version-1 JSON reports the assembly name, installed or linked kind, and whether state changed. A collision returns a structured refusal and preserves the existing installation.

Do not update or remove an existing installation.

## Acceptance

Tests cover local and remote install, link, inferred and explicit names, missing sources, collisions, repeated install, filtered source entries, interrupted creation, human and JSON output, bounds, and capability rows. Success always identifies newly published state.

## Dependencies

0246 establishes the assembly command family and read contracts.

## Complexity

- Contract score: 2
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 8
- Minimum level floor: level 3 for interrupted persistent publication
- Final level: 3
- Reasons: Install and link share naming, collision, and destination publication. Failure proof must prevent partial or falsely reported state.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if implementation replaces or deletes existing state.

## Review

- Design review: accepted 2026-09-11
- Code review: accepted 2026-09-11 after remediation; the initial review rejected missing exact current install and link command-matrix rows
