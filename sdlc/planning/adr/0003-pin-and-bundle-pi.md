# ADR 0003 — Pin and bundle Pi; zero deep imports

**Status:** accepted (Ian, 2026-07-31) · **Date:** 2026-07-31

## Decision

Pi is exact-pinned (no version range), carried as `bundledDependencies` so the
shipped artifact contains its qualified Pi, and upgraded only deliberately —
branch, qualify, land. Tarball sha256 integrity is recorded for the pinned
packages. Deep imports into Pi's `dist/` are banned by lint
(`no-restricted-imports` on `@earendil-works/*/dist/*` and any file-URL
probing); everything the runtime uses must come through Pi's `exports` map.

## Context

Pi ships several releases a week and breaks surface honestly: 0.81.0 removed
the exact symbols the predecessor called; 0.80.6 deleted a module-level
function and killed every run for a morning (predecessor ADR 0023's forcing
incident). Exact-pin-and-qualify held up; its one weakness was that the
predecessor's nine private `dist/`-path imports made the pin *layout*-bearing,
so hoisting could break production while every test passed. The fix is not a
better probe; it is refusing private surface entirely and getting the few
needed functions exported upstream (ADR 0011).

Two predecessor gaps closed here: its lockfile carried no integrity hashes for
the Pi packages, and its repo-wide `skipLibCheck: true` (forced by broken
vendored types) blinded typechecking to Pi's `.d.ts`. We verify current Pi
before conceding `skipLibCheck`, and file upstream if it is still needed.

*Verified and conceded 2026-07-31 (ticket 0004, the first Pi import):* the
eight errors are all in Pi's *transitive* dependencies' published types —
`@anthropic-ai/sdk` referencing an uninstalled `undici-types`,
`@google/genai` referencing the MCP SDK — never in Pi's own `.d.ts` or our
code. Installing strangers' missing type packages to satisfy their broken
references would breach the dependency freeze for someone else's bug, so
`skipLibCheck: true` is conceded with this evidence; our own sources stay
fully strict. Feeds upstream ask #5 (ADR 0011, published-types hygiene).

## Consequences

- Upgrading Pi is a reviewed event with a diff, never a drive-by.
- A capability reachable only through private Pi internals is, by definition,
  an upstream ask plus interim glue on public API — or not built.
- Keep lightweight module-shape assertions on the public surface we use; they
  are what caught the 0.80.6 break in the predecessor.
