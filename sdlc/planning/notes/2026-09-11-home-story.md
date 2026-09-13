# The home page tells the story

Branch `story` off `origin/main` at 7b05c88. It touches `docs/` only:
`src/content/docs/index.mdx`, `src/components/Lockup.astro`, and
`src/styles/brand.css`. `Walkthrough.astro` is untouched.

## The order

1. The lockup and one line of pitch.
2. The story block: three cards, who it is for, what it is, why it holds.
3. One line of lead-in, then the walkthrough.
4. The two buttons: install and run one, build your own.
5. Where to go next: the specification, the runtime, the use cases.
6. What it is not.
7. The maker line.

## Why the story sits above the walkthrough

Ian left the choice open: the walkthrough could stay first if it was simple
enough. It is not. It is twelve steps, a rail, a tree, a file pane and a
record ticker. A reader who lands cold cannot tell from it who the thing is
for or whether they are allowed to use it without writing code. The three
cards answer that in about sixty words and cost 170 px at 1440. The
walkthrough rail and its first step are still above the fold at 1440 and at
1024, so the reader sees the pitch, the story and the proof in one screen.

The cards are cards and not three paragraphs because three paragraphs would
run a full screen deep before the walkthrough started.

## What the story says

**Who it is for.** A domain expert owns the work and writes no code. The
procedure is written the way it would be handed to a new colleague. The work
runs on its own, repeats, and waits for nobody.

**What it is.** A specification and a runtime. A folder of plain files goes
in. The runtime walks it, runs the author's checks, and writes down what
happened.

**Why it holds.** Understandable, durable, portable, in Ian's own three
words, one sentence each.

Those claims come from the blog plan's story paragraph in
`mktg/products/botassembly/blog/README.md` and from `principles.md`. Nothing
on the page claims anything those two do not.

## What was cut as duplicate

**The old pitch line.** It read "A folder of markdown files runs as an agent
workflow, and every run leaves a record on disk." That is the mechanism, and
the "What it is" card now carries the mechanism. The pitch names the reader
and the job instead, which nothing else on the page did.

**The specification lane's opening.** It used to say "What an assembly is,
written down and testable," which the story block now says. The lane lists
the parts and the 143 conformance cases and stops.

**The runtime lane's second sentence.** It repeated "resolves an assembly"
against the story's "walks the folder." It now names the two commands and
what each one does, which is the only thing on the page that does.

**`triage` described twice.** The use-cases lane spelled out the same
assembly the walkthrough builds file by file. The lane now says the
walkthrough builds it and moves on.

**Two words a reader would have to look up.** "Corpus" and "rung" are gone
from the home page. The lane says 143 conformance cases and what a case is.

## Words the page does not use

No em-dashes. No "island", no "sentinel", no "corpus". No biomedical word
anywhere. The word "examples" appears only inside GitHub link targets, never
in a sentence, which the walkthrough extractor already enforces for its own
payload.

## What Ian can overturn

**The story above the walkthrough.** One block move in `index.mdx` puts the
walkthrough back on top with the cards beneath the lead-in. His own reading
was "if it's simple enough, yes, I want it first," and this note calls it not
simple enough. That is a judgement, and he saw the walkthrough before I did.

**Three cards rather than three paragraphs.** `.ba-story` in `brand.css` is
the lever. Dropping the grid to one column gives three stacked paragraphs.

**The pitch line.** "You write the procedure in plain English, and agents run
it in the background with nobody watching." It is second person, which the
rest of the site mostly is not. The alternative is third person, which reads
colder and buries the reader.

**The card width.** The band sits in the prose column, and the walkthrough
below it steps out to 76 rem. The two edges do not line up at 1440. Matching
them would push the cards wider than a comfortable measure.

## The proof

`npm run build --prefix docs` builds 31 pages. `node --test
docs/scripts/*.test.mjs` passes 38. `sdlc/scripts/lint` exits 0. Neither
`root-check.test.mjs` nor `navigation.test.mjs` asserts home page prose, so
neither changed.

Twelve screenshots: 400, 1024 and 1440, light and dark, viewport and full
page. Every one was read. One fault was found and fixed. The splash template
puts a top margin on each sibling in the flow, which pushed the second and
third cards 12 px below the first; the cards now set `margin-top: 0` and the
grid owns the gap. After the fix the three cards align at every width, the
cards stack cleanly at 400, and nothing wraps badly or scrolls sideways.
