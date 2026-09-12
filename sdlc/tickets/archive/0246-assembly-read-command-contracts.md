---
flow: build
priority: 1
deps: []
---
# Assembly read commands use current contracts

## Outcome

`bot assembly check` and explicit `bot assembly list` use the current dispatcher, help, capabilities, and finite versioned results.

## Current facts

Assembly reads still route through the legacy dispatcher. The public getting-started path uses assembly inspection.

## Scope

Adopt the existing assembly read owners. Add explicit current descriptors with no aliases. Preserve useful human output. Define bounded version-1 JSON results and structured errors. Do not change installation, linking, update, removal, discovery rules, or old commands.

## Acceptance

Contract tests cover options, modes, home and network policy, human output, versioned JSON, errors, bounded pages and summaries, and capability rows. The capability document remains below 65,536 bytes.

## Dependencies

None.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 1
- Cost of error score: 1
- Total: 4
- Minimum level floor: none
- Final level: 2
- Reasons: Two read-only public commands move onto an existing dispatcher and existing behavior owners. Several output modes need direct proof.
- Selected model: `gpt-5.6-luna` with high reasoning

Re-score if implementation changes assembly discovery or performs a mutation.

## Review

- Design review: accepted 2026-09-11
- Code review: accepted 2026-09-11 after remediation; the initial review rejected missing exact current check and list command-matrix rows
