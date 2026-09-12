---
flow: build
priority: 1
deps: []
---
# The complete gate checks the specification

## Outcome

The one advertised offline check rejects a missing local specification link and a mismatch between the record-event types and their documented vocabulary, both locally and in the hosted runtime workflow.

## Current facts

The root `make check` runs project lint and tests but omits `sdlc/scripts/spec`. The hosted runtime workflow runs that same incomplete target. Running the omitted script currently fails because `specification/elements/home.md` links to the documentation route `/reference/auth/`; the specification link checker treats rooted links as repository paths and no such repository path exists. The implementation authentication reference exists at `docs/src/content/docs/reference/auth.md`, while the runtime-agnostic contract exists at `specification/elements/auth.md`.

## Scope

Repair the specification link with a local specification target that exists. Add the specification script to the root `check` target. Add project-owned tests that run the complete gate against controlled mutations and prove that a missing local specification link and a stale or missing record field each fail through `make check`. Keep the check offline and deterministic. Do not weaken either existing specification rule, add a second hosted command, or make generated documentation output an input to the specification check.

## Acceptance

`make check` runs `sdlc/scripts/spec` exactly once and remains the command used by `.github/workflows/runtime.yml`. A controlled missing-link mutation fails `make check` with the specification-link diagnostic. Adding one documented top-level field that does not exist in `RecordEvent` fails `make check` with the `record vocabulary:` diagnostic. The unmodified repository passes `sh sdlc/scripts/spec`, the focused project tests, `git diff --check`, and the complete root `make check`. The specification changelog records the corrected contract link.

## Dependencies

None. Roadmap order places this after ticket 0264 because the release sequence requires a trustworthy gate before publication-boundary work begins.

## Risk facts

A test that calls the live repository can mutate or recursively check its own working tree. A fixture that replaces the specification script can prove only Makefile wiring, not the real rules. The proof needs controlled repository copies or inputs while preserving the actual gate and checker implementation.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 5
- Minimum level floor: none
- Final level: 2
- Reasons: The behavior change is small, but its proof must exercise the real root gate without recursion and must distinguish two independent specification failures.
- Selected model: `gpt-5.6-luna` with high reasoning

## Review

- Design review: accepted after one rejection. The first design named the wrong specification chapter, routed a score of five to the wrong implementation level, and left the record mutation ambiguous. The accepted design links to `auth.md`, selects level 2, and requires one documented field absent from `RecordEvent`.
- Code review: pending
