---
flow: build
priority: 5
opens: sdlc/scripts/lint
---
# The docs site cannot drift from the specification

The docs site's specification pages
(`docs/src/content/docs/specification/*.md`) are hand-made copies of
`specification/`, taken when the site was built on a branch. While
that branch lived, main landed 32 commits — tickets 0084, 0086, 0091,
0112, 0118 among them — that changed the specification and never
touched the copies. The site still builds and looks complete, so the
drift is silent: a reader of the published site today is reading a
specification several rulings old, with no signal anywhere that the
`fault` tool, the failure-hook ruling, the run-idleness change, or
the slot-name rules exist.

The difference between a copy and its source is mechanical:
Starlight frontmatter on top, headings demoted one level, links
rewritten from `elements/foo.md` to site routes, and a few spec
files merged into one page. Everything else is supposed to be
byte-identical prose — which is exactly what a script can produce
and a human cannot be trusted to re-copy on every spec change.

## Why it matters

- The specification is the product's contract, and the site is where
  outsiders read it. A site that quietly lags the spec misrepresents
  the contract with full confidence.
- Hand-copied mirrors always drift again. The fix must make drift
  impossible or loud, not ask a person to remember — the desired end
  state is the build failing when the pages do not match, never a
  re-copy chore.
- There is one source of prose. The moment the docs copy is edited
  directly, there are two specifications; generation removes the
  second one structurally.

## What done looks like, observably

- The specification pages under `docs/src/content/docs/specification/`
  are generated from `specification/` by a script in the docs build:
  frontmatter applied, headings demoted, links rewritten, the
  page-to-source mapping (including merged pages) declared as data in
  that script.
- The hand-made copies are deleted; the generated output is not
  committed, or if committed for the build host's sake, a check fails
  when regeneration produces a different byte stream.
- That check runs from `sdlc/scripts/lint`, so the gate ladder runs it
  on every flight. See the section below: a check that lives only in
  the docs build is a check the factory never runs.
- A specification file with no entry in the mapping fails the build
  by name — a new spec element cannot be silently absent from the
  site.
- The generated pages reflect today's specification, including
  everything from the 32-commit gap.

## The docs site is not gated today

`sdlc/scripts/lint` runs `make -C bot lint …` and nothing else. No rung
of the ladder — `lint`, `test`, or `spec` — mentions `docs/` at all, so
the docs site is entirely outside the gates. A drift check placed in
the Astro build alone would be run by a person building the site
locally and by nobody else; every future flight that edits the
specification would pass green while re-opening the exact gap this
ticket exists to close.

So the check has to reach the ladder. The ticket opens
`sdlc/scripts/lint` for that. What this costs is the real trade-off to
settle: `lint` currently needs only `make` and the `bot` toolchain, and
regenerating the pages likely pulls the docs toolchain into the first
rung of every flight in this repo. If that cost is judged too high, the
answer is a cheaper comparison that still runs in the ladder — not
moving the check somewhere the factory cannot see it.

## Options considered

Generation (recommended) over a diff-check against retained copies:
the check variant keeps two editable sources and only detects the
divergence it anticipates; generation leaves nothing to edit in the
wrong place. If the transform meets a construct it cannot map, that
is a build failure, not a fallback to the stale copy.

## Boundary

`specification/` is untouched — it remains the only authored source
and this ticket adds nothing to it. Docs-native pages (guides,
reference, principles, index) stay hand-authored; only the
specification mirror is generated. No change to bot, the spec's
content, or the conformance corpus.
