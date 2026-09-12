# Home page: pitch with proof

Date: 2026-09-11. Branch `home`, off `site`.

The brief is section 6 of `2026-09-11-fresh-eyes-site-review.md`: a folder tree and eight lines of a record side by side above the fold, one command that wrote that record, one sentence on what the project does not do. The home page now does that.

## Shape

Above the fold at 1440 wide: the lockup, one sentence, two proof panels, the command, two buttons. Below: four feature blocks, four benefits, four principles, one honest limits block. `template: splash` with no `hero` frontmatter, so `Fold.astro` owns the whole first screen. The splash heading panel is hidden by CSS because the lockup image carries the same name and the brand guide asks for the title once.

New file: `docs/src/components/Fold.astro`. `docs/src/styles/brand.css` gained a home-page section at the end. No client JavaScript.

## The proof

The tree and the record excerpt come from one real run, not from an invented example: run `2026-09-11T12-36-58-eb14` of the `vtriage` assembly, kept in the capability experiment outside this repo. That assembly exercises a checklist, a schema, a gate pair, before and success hooks, a skill, and a CHOOSE node in one flow, which is why it is the one on the page.

The excerpt is six events lifted from `record.jsonl` and wrapped to fit the panel: the request with its SHA-256 and byte count, a stage start carrying the resolved model and the rung it came from, a turn with its token counts, a check verdict, the choice with its declined branch, and the sealed stage end. Machine-specific fields are scrubbed: no home paths, no installation id, no credentials. The run id and the hashes stay, because they are what makes the excerpt checkable.

The tree is the flattened form the experiment's own notes used. The full nesting ran to twenty-three lines and pushed the buttons under the fold.

## Copy decisions

One sentence replaces the four-sentence tagline. The dropped facts are not lost; each one now sits in the block that owns it. Every fact appears once.

Feature blocks lead with the mechanism and then cite the run. `bot check` is folded into the checks block instead of standing alone, because both are about judging work before it ships.

Benefits are written as the reader's sentence, not the product's: review a change as a diff, hand it to a teammate, diagnose a failure from the record, swap a model in one edit.

The limits block is `caution` and says three things: not a sandbox, no run-wide budget, pre-1.0 contracts may change. Sources are the Focused, not sandboxed principle, `guides/install-and-use.md` on bounding a run, and the compatibility policy.

No testimonials and no invented numbers. Two things were left out for want of a source. There is no dollar cost in the record, so the page reports tokens and says nothing about spend. There are no adoption or performance numbers anywhere, so the page claims none.

## What would be better

The command on the page ran an assembly that this repository does not ship. A reader can read it but cannot paste it. The fix is to ship a small example assembly with the docs and point the hero at that instead. Filed as the next thing to do on this page.

## Review

`npm run build --prefix docs` passes. Captured at 1440 and 400 wide in both palettes and inspected. Two defects were caught by looking and fixed: the record panel clipped its two longest lines, and the full tree pushed the buttons below 900 px.
