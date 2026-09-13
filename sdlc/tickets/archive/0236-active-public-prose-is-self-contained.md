---
flow: build
priority: 1
---
# Maintained public prose is self-contained

## Outcome

Maintained reader-facing Markdown contains no known private ecosystem references. Explicitly retained historical evidence and required public identifiers remain unchanged.

## Current facts

The current public-tree check scans only selected paths. Active planning, drafts, issues, and SDLC guidance still contain private project names and wording from the retired dispatcher. The check uses substring matching. It can reject ordinary words, code identifiers, and package names. It also skips covered symlinks and read failures.

## Scope

Cover these tracked prose classes:

- Root public guidance: `README.md`, `SECURITY.md`, and `CONTRIBUTING.md`.
- Documentation: Markdown and MDX under `docs/src/content/docs/`.
- Narrative specification: `specification/README.md`, `specification/CHANGELOG.md`, `specification/conformance.md`, `specification/example.md`, and Markdown under `specification/elements/`.
- Smoke guidance: `smoke/README.md` and `smoke/falsifications.md`. Executable smoke assembly prompts remain outside this prose ticket.
- Active planning: Markdown under `sdlc/planning/` after the historical exclusions below.
- Draft tickets: Markdown under `sdlc/tickets/drafts/`.
- Active issues: Markdown under `sdlc/issues/`.
- SDLC guidance: `sdlc/README.md` and `sdlc/scripts/README.md`.

Exclude `sdlc/records/**`, `sdlc/tickets/archive/**`, `sdlc/planning/archive/**`, and `sdlc/planning/bot-contraction/records/**`. Preserve `sdlc/planning/bot-contraction/baseline.md` and `sdlc/planning/bot-contraction/legacy-cli-retirement-ledger.md` as exact measured history. Ticket 0247 owns the current caller re-audit. Allow the exact security-contact address already present in `SECURITY.md` only at that path. Do not add a general name exception.

Use this exact public-prose policy. Join each adjacent quoted fragment before matching. Match the paths `"/home/" + "ian/"` and `"/Users/" + "ian/"`. Match these bounded tokens without regard to case: `"trials"` followed by optional whitespace and a number, `"genom" + "oncology"`, `"var" + "classify"`, `"bio" + "mcp"`, `"pico" + "hr"`, `"rolo" + "dex"`, `"factory" + "2"`, and `"imau" + "rer"` subject to the one exact security-contact exception. Match these bounded ambiguous names only with their shown title case: `"Fac" + "tory"`, `"De" + "ck"`, `"Nu" + "cleus"`, `"Lib" + "rarian"`, and `"Bio" + "Data"`. Use Unicode letter, number, and underscore boundaries. Allow ordinary lowercase English, larger words, code identifiers, and package names. Scrub known ambiguous lowercase references because a denylist cannot classify their meaning safely.

The public-tree policy above controls maintained prose. It uses the union of the relevant names from the current public-tree checker and living-source guard. The living-source guard keeps its existing source-specific list and exclusions.

Keep the existing runtime-source private-name guard. It protects living source outside planning. The public-tree guard protects maintained prose.

Keep the five tracked `sdlc/project/` lifecycle scripts. Current tests and pinned provenance still exercise them. Replace reader-facing claims that the retired dispatcher calls these scripts with generic project-lifecycle wording. Ticket 0247 owns any later migration or deletion.

## Acceptance

A table-driven hostile case fails for every covered prose class. Every historical exclusion admits the same hostile token. The exact security email passes only in `SECURITY.md`, and the personal name fails elsewhere. Distinctive names fail under case changes and punctuation. Larger words, generic lowercase English, code identifiers, and package names pass.

A covered symlink scans its stored link text without following its target. A forbidden token in that link text fails. Existing broken-symlink credential-path behavior remains. Covered non-UTF-8 or NUL-containing prose fails as non-text. An unreadable covered tracked path fails with a named diagnostic. Uncovered binary files are not read.

Scrub every known private project and retired-dispatcher reference from the covered tracked tree. Do not rewrite excluded history. The real tracked tree and complete repository check pass.

## Dependencies

None.

## Risk facts

The change reaches several documentation areas and one repository gate. Historical evidence must remain byte-for-byte unchanged. A broad word ban would reject valid prose and dependency names. A narrow token list cannot identify every ambiguous lowercase reference, so the implementation must scrub the known uses and keep the rule bounded.

## Complexity

- Contract score: 2
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 6
- Minimum level floor: none
- Final level: 3
- Reasons: Correctness depends on explicit path classes, historical exclusions, safe symlink and text handling, bounded token matching, and adversarial proof across several maintained surfaces.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Decision

Preserve the measured baseline and legacy-command ledger in place as historical exclusions. Moving them would add churn without changing the retained evidence. Rewriting them would damage the exact audit evidence. Ian can overturn this by moving both files under an archive path in a later documentation-only change.

## Review

- Design review: accepted after the ticket defined the exact self-hosting lexical policy, prose classes, historical exclusions, file-read rules, retained lifecycle treatment, hostile tests, and level-3 routing
- Code review: accepted; 139 covered prose files pass, all 16 prose edits preserve meaning, and 453 excluded files plus both retained audit files remain unchanged
