# The conformance page's runtime-tests paragraph is one 476-word block

Observed on 2026-09-11 during a live review of the published site, reading
`/specification/conformance/` at 1440px and at 400px.

## What is wrong

The paragraph that begins "The static assembly corpus does not exercise a running
writer or retained run records" is 476 words with no break, no heading, and no
list. Measured on the branch `polish` by splitting the page body on blank lines
and counting words per paragraph:

```
476 words | The static assembly corpus does not exercise a running writer or ...
203 words | Capability tests prove that the real CLI reports the same package ...
153 words | Run-output tests compare the noun-based command with `bot output` ...
141 words | Run-list tests prove the inert bounded Markdown and versioned JSON ...
```

The 476-word block is more than twice the next longest on the page. It enumerates
distinct test families in sequence, so the content is already a list wearing a
paragraph's shape. At 400px it runs for several screens with no landmark.

## Why a docs branch cannot fix it

`docs/src/content/docs/specification/conformance.md` is generated. `docs/scripts/generate-specification.mjs`
line 108 names `specification/conformance.md` as its only source. Editing the
generated page is overwritten on the next build, so the paragraph has to be split
in `specification/`, which a docs branch does not touch.

## What a fix does

Break the source paragraph in `specification/conformance.md` into one entry per
test family, or into short paragraphs under a subheading. The specification is
normative prose, so the change is editorial only: no sentence changes meaning, and
the conformance case count stays at 143.

## Evidence

- `docs/src/content/docs/specification/conformance.md`, the generated page.
- `specification/conformance.md`, the source.
- `docs/scripts/generate-specification.mjs:104-108`, the generation rule.

## The paragraph also cites an internal ticket number

Observed on 2026-09-11 while reading `specification/conformance.md`. The 476-word
paragraph contains the clause "A mechanical check rejects Linux descriptor-namespace
paths in the portable implementation and stale ticket 0032 identity attribution."

`ticket 0032` is an internal work item. The specification is the public normative
document a second runtime is written against, and a reader outside the repository
cannot resolve that number or tell what it obliges. A conformance requirement
cannot be stated by reference to a ticket.

The fix belongs with the paragraph split: state the requirement in the
specification's own vocabulary, or drop the clause if the mechanical check is a
repository convention rather than a conformance condition.

## The site no longer ships the paragraph

`docs/scripts/generate-specification.mjs` now replaces the body of the
"Operational record conformance" section with two sentences and a link to the
source file. The source is untouched, so this issue stays open. The generator
fails the build if the heading is renamed, so the summary cannot silently drift.
Reasoning is in `sdlc/planning/notes/2026-09-11-third-review-content.md`.

## Disposition (2026-09-12)

Finding 1, the source's long runtime-tests paragraph, is retained as a later
editorial opportunity. Review on 2026-10-12 or when the conformance page gets
its next reader-facing revision.

Finding 2, the public source paragraph's internal ticket reference, is a
confirmed release-document defect owned by alpha outcome 17's specification and
documentation alignment. Review it during the candidate document sweep.
