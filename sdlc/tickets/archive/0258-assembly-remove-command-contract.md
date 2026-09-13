---
flow: build
priority: 1
deps: [0255]
---
# Assembly remove uses the current command contract

## Outcome

Assembly remove uses the current dispatcher and reports the exact installation it removed.

## Current facts

Remove deletes installed assembly state through the legacy dispatcher. A wrong target or misleading result can destroy the operator's only local copy.

## Scope

Adopt the existing removal owner. Add one current descriptor with no alias. Preserve target validation, installed-root containment, link handling, and useful human output. Version-1 JSON reports the assembly name, prior installation kind, and `removed: true`. Missing targets and unsafe paths return structured refusals. Interruption may leave part of a copied installation in a hidden quarantine inside the home. It never reports success. A later remove can retry. The source and neighboring installations remain untouched.

Do not remove source repositories or paths outside the installed assembly root.

## Acceptance

Tests cover copied and linked installations, missing targets, hostile names and paths, interrupted partial target state, successful retry, human and JSON output, bounds, exit codes, source preservation, neighboring installation preservation, and the capability row.

## Dependencies

0255 supplies the current assembly mutation family and installation identity rules.

## Complexity

- Contract score: 1
- State and timing score: 2
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 8
- Minimum level floor: level 4 for destructive persistent state
- Final level: 4
- Reasons: The command intentionally deletes installation state. Hostile-path and interruption proof must show that no source or neighboring installation can be removed.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if removal becomes recoverable through a specified trash contract.

## Implementation decision

Use an identity-bound hidden intent and quarantine before recursive deletion. Hold one stable assemblies-directory lock from intent discovery through quarantine deletion and namespace pruning. Keep the completed intent through successful lock release, then remove it idempotently. This closes the race with supported install and update commands; a check followed by pathname deletion does not. It also gives one caller exclusive destructive settlement when removals overlap. A concurrent caller gets a retryable busy failure. After successful release, concurrent callers may share only completed-marker cleanup because the quarantine is already gone. Cost: removals of different names serialize across a home, a crashed owner can delay retry until the ten-second stale boundary, removal maintains temporary hidden state, and install refuses the same name until removal clears it. An unverified replacement may remain quarantined for manual recovery. Malformed removal state is a shared nonretryable integrity failure for remove, install, and link. Direct same-account edits to the hidden coordination entries remain outside Bot's trust boundary. This choice can be overturned if the runtime gains a smaller per-name stable lock, an atomic verified-delete primitive, or serialization for all management mutations.

## Review

- Design review: accepted 2026-09-11
- Code review: pending
