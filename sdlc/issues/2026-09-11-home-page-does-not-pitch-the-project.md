# The home page describes the format but does not pitch it

Observed on botassembly.org on 2026-09-11. `docs/src/content/docs/index.mdx` is a Starlight splash with a tagline and four cards. It answers what an assembly is. It does not tell a reader why they would want one, it shows no assembly, and it shows no record.

## What is missing

A reader arrives and leaves without seeing the thing the project is about. There is no runnable example on the page, only a link to `/specification/example/`. There is no excerpt of a real record, only a description of one. Benefits are implied rather than stated, and the principles have their own page that the home page never summarizes.

## What a rewrite does

Keep the tagline and the four-card structure as the base. Both work and both are accurate. Build the pitch around them.

Add features and benefits stated plainly: a workflow that reviews as a diff, checks the author defines rather than trusts, a record that survives the runtime, and intelligence names that make a model swap one edit.

Add the principles in short form, drawn from `docs/src/content/docs/principles.md` rather than reinvented.

Put one small runnable assembly on the page itself, as a folder tree plus the text of one stage. It must be an assembly that actually runs, not a sketch.

Put a real excerpt from that assembly's record on the page: what the stage was told, what it produced, what judged it, what it cost. Take the bytes from an actual run.

## Boundary

Every claim must stay true to `docs/src/content/docs/principles.md` and the specification pages under `docs/src/content/docs/specification/`. Where the copy and the specification disagree, the specification wins and the disagreement becomes its own finding.

## Depends on

The theming finding filed the same day. Rewriting copy against colors that are about to change wastes the review.
