---
flow: build
priority: 3
---
# The provenance test keeps its hands off the live tree

`bot/tests/runtime-provenance.test.ts` rewrites the repo's real
`bot/package-lock.json` in place and restores it in `finally`. A
killed test run leaves the checkout dirty, and a parallel test
resolving provenance mid-window reads the mutated bytes. Found by
the 2026-08-12 post-landing review.

Rework the changed-lockfile case to a copied package root or
injected lock path so the live tree is never written. The
assertions (byte-changed lock changes the digest) keep exact
strength; only the fixture mechanics may change, in design:
commits, in that file only.

## Refusal addendum, 2026-08-13 (architect)

The first attempt's edit was judged correct but rode in an
ordinary `code:` commit. The rule stands: every edit to
`bot/tests/runtime-provenance.test.ts` — including the mechanical
removal of the test-only cast — lands under `design:`,
`design-review:`, or `code: fix mechanical`. Restructure the
commits on the continued branch; do not redesign the work.
