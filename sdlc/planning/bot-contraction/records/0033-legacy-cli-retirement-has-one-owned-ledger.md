---
flow: quickfix
priority: 10
completed: 2026-09-06
---
# Legacy CLI retirement has one owned ledger

## Result

The [legacy CLI retirement ledger](../legacy-cli-retirement-ledger.md) now names every observed supported caller, its required noun command, its migration owner, and the deletion conditions for the temporary old-spelling layer.

The audit pins clean commits for Bot, Factory, SDLC, Deck, and their replacements. Each cross-repository fact remains current only at its pinned commit. A caller owner reports an exact migrated commit, then Bot performs a bounded re-audit and updates the ledger. Bot's own complete check never depends on a sibling checkout.

The ledger separates executable callers, tests and smoke, active documentation, and immutable history. It records six implemented new-surface operations and every missing replacement. It preserves the measured conservative deletion floor of 302 nonblank production lines and today's 15,062-to-14,760 projection without turning that projection into a future ceiling.

## Review

Independent design review rejected a ledger without exact sibling commit pins or a freshness rule. Remediation added both and confined mechanical enforcement to Bot-owned source. Independent code and document review found one incorrect operation label and one contradiction about where the temporary bridge could be documented. Remediation corrected both. Re-review accepted the result.

## Checks

Every pinned commit resolved. Sampled production callers matched their cited files at those commits. The public-name scan and `git diff --check` passed. The complete root `make check` passed with 201 test files, 1,332 tests, 143 of 143 conformance cases, and the 15,082-line production ratchet. This ticket changed no production code.
