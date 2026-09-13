# Third live review: the content half

Content fixes found by reading the published site on 2026-09-11. Styling,
components, and the two format explorer pages belong to a separate branch.

## The site claimed there was no CI

`/project/development/` carried a section titled "No CI, on purpose (for now)".
The repository has run `.github/workflows/runtime.yml` and `.github/workflows/docs.yml`
on every push since before that section was written. The section is replaced by
three sentences naming what the hosted workflows run and saying that the hosted
gate calls the same `make check` a developer calls. `examples/README.md` said
"checked in CI" and now says "checked by the hosted gate", which is the same
claim without the abbreviation.

## The examples folder described four examples and shipped two

`examples/README.md` promised one example per capability set. Two assemblies
exist, `vtriage` and `digest`, and both are combined examples. The page now
lists what exists, one line each, and puts the rest under a "Planned" heading.
The planned list comes from `sdlc/issues/2026-09-11-no-public-examples-program.md`.

## The digest proof was pasted from an older home

`examples/digest/README.md` showed a `bot check` transcript naming
`gemini-2.5-flash-lite` while `examples/vtriage/README.md` named
`gemini-3.5-flash-lite`. Two pasted proofs disagreeing about the model teaches a
reader that a proof is decorative. The digest transcript was regenerated against
a throwaway home mapping `default` to `google/gemini-3.5-flash-lite/low`, built
the way `sdlc/scripts/examples` builds it, and pasted verbatim.

## Generated pages rendered their title twice

Starlight renders the frontmatter title as the H1. A source document whose own
top-level heading says the same thing was demoted to an H2 and rendered directly
under it. Five pages did this: conformance, gating, refusals, invariants, and
record. `generate-specification.mjs` now drops a leading H2 whose text equals the
page title, compared case-insensitively, and the anchor that heading owned
resolves to the top of the page instead.

## Generated pages carried three tables of contents

Every concatenated page opened with an inline "On this page" line the generator
wrote. Starlight already renders its own contents rail on the right and a
contents bar on mobile, so a reader saw the same list three times. The inline
line is removed. Source anchors are still computed, because cross-page links
depend on them.

## The site shipped 2,400 words of runtime test notes

`/specification/conformance/` carried a section "Operational record conformance"
made of very long paragraphs of runtime test notes, and one of them cites the
internal work item "ticket 0032". A public normative document cannot state a
conformance condition by reference to a ticket a reader cannot open.

### The decision

The generator replaces that section's body on the site with two sentences and a
link to `specification/conformance.md` on GitHub. The specification source is not
edited.

Why the site and not the source: the specification is the normative document, a
docs branch is not where normative prose is rewritten, and the rewrite is a real
editorial job with a real reviewer. That job is
`sdlc/issues/2026-09-11-conformance-runtime-tests-is-one-unbroken-paragraph.md`,
which now also records the ticket-number finding. The site fix is the stopgap
that stops a reader hitting the wall today.

Why it is keyed on the heading text: a summary that silently survives a rewrite
of the section it summarizes is worse than the long text. The generator throws
when the heading is gone, so renaming or splitting the section fails the build
and forces a decision. `docs/scripts/generate-specification.test.mjs` covers both
the summary and the refusal.

Ian can overturn this. The alternative is to ship the long section until the
source is rewritten.

## The worked example sat in a group of one

The sidebar had a "Guides" group holding one entry, "The Worked Example", whose
route is `/specification/example/`. It now sits in the Format group directly
after Overview, which is where its route already said it lived. The Guides group
is removed.

## Home and the format page

The home page now links `/format-and-runtime/` from the gating card and carries
the corpus count, 143 cases. It also says, next to the record browser, that the
paths inside the shipped record were rewritten for publication, so the request
hashes in it no longer recompute. That was true and unsaid, and a reader who
verified a hash would have concluded the runtime was broken.

`/format-and-runtime/` now carries the sentence that static corpus passage does
not imply invariant compliance, which until now only appeared on the conformance
page, several pages deeper than the claim it qualifies.

## Naming

"Bot" as a bare product name is ambiguous between the command and the project.
Hand-written pages now use `bot` for the command and "Bot Assembly" for the
project. Generated pages are not touched, because their source is the
specification.

## Left open

Inline code followed by punctuation renders with a stray space on the published
site, for example `bot` 's and `PARALLEL.md` ,. Grepping the Markdown sources for
a backtick followed by a space and punctuation finds nothing: the sources are
written correctly. The space is introduced when the page is rendered, so the fix
belongs to whoever owns `docs/src/components/` and `docs/src/styles/`.

Three visible instances were reworded out of the way while the rendering fault
stands: the hosted-checks sentence on `/project/development/`, the possessive
"`bot`'s surface" on `/format-and-runtime/`, and the comma between two sentinel
files in the `/reference/limits/` table. Rewording every instance on the site is
not the fix and was not attempted.

The `max-depth` cell in that table wrapped mid-token because the third column
carried long trailing clauses. Every cell in that column is now a short phrase
and the detail moved to the sentence under the table. Checked at 1440.
