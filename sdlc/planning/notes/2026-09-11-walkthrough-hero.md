# The walkthrough hero

Branch `walkthrough` off `origin/main` at bb7b47c. It touches `docs/` only. The
design study it implements is the home page walkthrough study of the same day.

## What shipped

The home page hero is now the lockup, the one-line pitch, and twelve steps that
build one real assembly a file at a time, check it, run it, and open the record
it wrote. `docs/src/components/Fold.astro` is gone. `Lockup.astro` carries the
name and the sentence it used to carry.

Three files do the work.

`docs/scripts/walkthrough-steps.mjs` is the copy. Twelve entries of title, the
files the step adds, the file it shows, a focus marker, one paragraph of
explanation, a specification link, and a GitHub path. Every path is relative to
`examples/` and is also the path the page prints, so no short path is written
twice.

`docs/scripts/extract-walkthrough.mjs` reads those paths off disk, pulls the
`bot check` paste out of the assembly's own README by fenced block, folds
`record.jsonl` into the rows a ticker draws, and writes
`docs/src/data/walkthrough.json`. It fails the build when a step names a file
that is not there, when a file is empty, when a focus marker is absent, when the
payload names `examples` anywhere a reader would see it, and when the JSON
passes 120 KB. It runs in `npm run build` after `extract-corpus`. The payload is
22 KB: 12 steps, 14 files, 5 check rows, 94 record lines, 20 ticker rows.

`docs/src/components/Walkthrough.astro` renders all twelve steps server-side and
drives them with one plain script. No framework. A numbered pill rail, prev and
next, arrow keys, Home and End, `aria-current` on the live pill, a hash per step
written with `replaceState`, a tree that accumulates with the new file lit, a
content pane, and two links per step. The run step plays the record grouped into
four stage cards and honours `prefers-reduced-motion` by drawing every row at
once. The last step shows the sealed card and a link to the whole record.

Below it, three lanes: the specification, the runtime, the use cases. The limits
block and the maker line are unchanged.

## Decisions Ian can overturn

**140 ms a row.** Twenty rows play in 2.8 seconds. `PACE` at the top of the
script is the lever. A reader who asked for less motion gets every row at once,
and everyone gets a "skip to the end" button while it plays.

**Twelve steps.** The ladder is one idea per step. Fewer steps means more than
one idea in a pane. The lever is the array in `walkthrough-steps.mjs`; adding or
cutting a step is one entry and the tests follow the array.

**A pill rail, not a scrollytelling column.** The rail is a column of twelve
numbered pills at 1440 and a scrolling row of bare numbers at 400. A reader can
jump. The alternative, one long scrolling page, would show every step at once
and lose the click-through.

**`replaceState`, not `pushState`.** Twelve steps would leave twelve entries in
the back button. A hash on load still selects its step, and arriving on step 11
plays the run. The cost is that the back button leaves the page rather than
stepping back through the walkthrough.

**The record stays hidden until the run step.** Ruling of 2026-09-11. A visitor
who never clicks never sees a record.

**No rail without scripting.** The no-JS state is step 1 fully rendered with its
tree, its file, its explanation, and both its links, and a `<noscript>` list of
the other eleven steps as specification links. The design study wanted the pills
themselves to be anchors. Dead pills read worse than no pills.

## What was trimmed from the design

**The check step wraps rather than scrolls.** The design let the pane scroll
sideways and offered a trimmed option ladder with a caption. The rows are about
230 characters; at 400 px that is eight screens of sideways scrolling, and at
1440 px it still clips. The pane now wraps with a hanging indent, so every
resolved option and its rung is on screen at both widths and nothing is cut.
Nothing was trimmed, so no caption claims it was.

**The tree does not collapse to a summary line on the run steps.** It is
replaced by one sentence saying what the folder now holds, which was the
design's intent, written as a sentence rather than a collapsed tree.

**The turn counter is a row, not a live counter.** `provider_start` and `turn`
pairs collapse into one row per stage reading `11 turns · 23,742 tokens`. A
counter that animates while the rest of the ticker plays was more motion than
the step needs.

**Steps 10 to 12 add no file to the tree.** The record's own folder listing is
in the sealed card instead, where it says what a run leaves behind.

## The proof

`bot check ./triage/triage` was run from `examples/` against a throwaway home
whose `default` is `google` / `gemini-3.5-flash-lite` / `low`. It printed the
five stage rows and exited 0, byte for byte the paste already in
`examples/triage/README.md`, which is where the page reads it from. `bot check
./triage` prints one `assembly` row, which is why the page shows the flow target
and not the assembly target.

`npm run build --prefix docs` completes with 31 pages. `node --test
docs/scripts/*.test.mjs` passes 31, nine of them new. `sdlc/scripts/lint` exits
0, which includes `sdlc/scripts/examples` resolving all four assemblies. The
built `dist/index.html` carries the string `examples` only inside `href`
attributes, and carries neither `vtriage` nor `requests/`.

## Screenshot findings and fixes

Twenty screenshots at 1440 and 400, light and dark, on steps 1, 6, 10, 11, and
12. Every one was read and every fault below was fixed and re-shot.

- The `bot check` rows clipped at 45 characters on a phone and at 110 on a
  desktop. The pane now wraps.
- `10`, `11`, and `12` read as `18` in the pill and in the step counter. The
  mono face's slashed zero is illegible at 0.72 rem. Step numbers now set in the
  body face.
- The active pill sat off-screen on a phone when a step was reached by hash. The
  rail now scrolls it to the centre, moving its own scroll and never the page.
- The ticker stayed at its first stage while the later ones played out of sight.
  It now follows the newest row inside its own box.
- The `scroll →` hint appeared on panes with nothing to scroll. The script now
  measures each pane and hides the hint where the text fits.
- An evidence sentence ran past the right edge of its card at 400 px. It takes
  its own line below the event name there and sits beside it at 1440 px.
- The third lane orphaned onto a second row at 1440 px. The lanes are an
  explicit three columns on a wide screen.
- The band was 1080 px inside a 1440 px window, which clipped an eighty-column
  file. It steps outside the prose column to 76 rem with an 8 rem gutter.
- A six-line file left a void beside a twelve-pill rail. The two panes hold one
  height on a wide screen, so stepping does not resize the page.
- The tree listed folders before files. It lists files first, the way a listing
  reads.
- `run_end exit 0` appeared twice, in the ticker and in the status line. The
  status line now reports the record's 94 events.

## What is not done

The assembly's `README.md` is in the folder and never in the tree the page
draws. That is deliberate; the tree shows the twelve ideas and nothing else.

`sdlc/scripts/examples` proves the assembly resolves. Nothing proves the sealed
run still matches the assembly beside it. The extractor asserts the record's
line count and its four stage names, so a re-recorded run fails the build rather
than drifting quietly, which is as far as this branch goes.

## Polish pass, branch `walkthrough-polish`

Two nits from Ian's own read of the screenshots, and one bug the second nit
uncovered.

**Prose wraps, machine text does not.** The extractor marks a file `wrap` when
its name ends in `.md`. A wrapped pane uses the class the `bot check` paste
already used and shows no scroll hint, because it never clips. A schema, a gate,
a hook, and the check paste keep their own rule.

**One run_end, not two.** The status line under the ticker reported `run_end
exit 0`, which the last ticker row already said. It now counts the record's own
events while playing, `34 of 94 events`, and reads `94 events in record.jsonl`
once settled. Each drawn element carries the number of record events it stands
for, and the extractor fails the build unless those numbers add to the record's
line count, so the count on screen is the record's and not the ticker's.

**The bug.** `.ba-walk__event` and `.ba-walk__ticker-line` set `display: flex`,
which outranks the user agent's rule for the `hidden` attribute. Playback hides
rows with that attribute, so every row and the `run_end` line were on screen
from the first frame. Only the stage cards, which set no display, ever hid. One
rule, `.ba-walk [hidden] { display: none !important }`, fixes it for good.

## Fifth review

A fresh pair of eyes read the live site and filed ten items. What each one became.

**1. No scripts, no walkthrough.** The rail and the Back/Next controls were
hidden until the script added `is-live`, and the file pane collapsed to two
pixels. The pills and the controls are now plain anchors to each step's hash,
and CSS `:target` selects the step, so every one of the twelve is reachable with
scripting off, not only the first. The `<noscript>` block is gone; it has
nothing left to say. Verified against the built page with every `<script>` tag
stripped out.

**2. Step 10 was a wall.** The five rows are still the real paste, byte for
byte, but the repeated `options=` tail folds to `options=…` and one button,
"show every option", opens all five at once. With no script the ladder is open,
which is the honest default. The explanation now leads with the claim worth
leading with: `bot check` calls no model and costs nothing. Then what the rows
mean, and that two of them are the arms of the choice, so a run walks four.

**3. The tree fought the page's own rule.** Step 2 says the listing order is the
run order, and the tree put `03-verify/` above `02-route/`. The extractor now
sorts every level by name, and a test walks the tree and fails if any level is
out of order.

**4. Five stages or four.** The banner counted stage files and the record
counted stages walked, with nothing to bridge them. The banner now says five
stage files and that a run walks four, because the choice takes one arm and
declines the other. A test asserts the two numbers come from the same resolved
data, and the extractor fails the build unless exactly one resolved stage goes
unwalked.

**5. The empty fences stay.** Stripping the empty `---` / `---` from the stage
and sentinel files makes `bot check` refuse the assembly: invariant 42 requires
fenced front matter and a body on every one, empty or not, and
`sdlc/scripts/examples` goes red. The fix became copy instead. Step 3 now says
the fence is required even when it sets nothing, and that the stage takes every
option from the assembly.

**6. Step 6 explained the wrong file.** It now explains the file on screen
first, in plain words: a gate is a script that runs after the stage, exit 0
passes the work on, any other exit sends it back with the script's own words as
the reason. One sentence then covers `01-blocker`, and defines 75 inside the
sentence. The gate script itself lost the simulation hook, the provenance
section and the record id; it keeps its behaviour and is now six lines a
stranger can read.

**7. Words the page never defined.** "Sentinel" and "rung" are gone from the
copy. A test asserts neither word comes back.

**8. Keyboard focus.** An arrow key moved the selection and dropped focus, so
the second press did nothing. Focus now follows the selection onto the active
pill, and the rail scrolls it fully into view at 400.

**9. Dead space at 1440.** The tree pane no longer stretches to the height of
the step; it sits at the top and holds at most 26rem, and the step keeps a
floor so the layout does not jump between steps.

**10. GitHub links.** A file link is `/blob/main/`, a folder link is
`/tree/main/`. No more 301 on every file. A test checks both shapes.

**One more, found while shooting.** The wrapped panes carried the check pane's
hanging indent, which in a `pre` outdents only the very first line. Every
markdown pane opened with a `---` hanging into the gutter. The hanging indent
now belongs to the check pane alone, where each row wants it.

## Controls and captions

Branch `walk-ui` off `origin/main`. Ian read the shipped hero on 2026-09-11 and
named three faults. It touches `Walkthrough.astro` and `brand.css` only.

**The scroll hint is gone.** The `scroll →` caption read as a button that did
nothing when pressed. Every pane that clips already carried the two affordances
the rest of the site uses, an 8px bar and a fade at the clipped edge, so the
caption was a third claim on top of them. The markup, the stylesheet rule and
the script that measured each pane are all removed. Nothing else on the site
used the class.

**The controls moved into the rail.** Back, Next and the counter used to sit
under the panes, a column away from the pills that do the same job. They now
live in `.ba-walk__controls-rail`, directly after the pills: under the twelve
pills in the left column on a wide screen, a compact row directly beneath the
pill strip on a phone. Twelve sets are in the page, one drawn at a time.

Which one is drawn is the same question as which pill is lit, and with no
script the answer is the fragment. That correlation needs one selector per
step, so `Walkthrough.astro` writes those rules itself and the stylesheet holds
none of them. The rules cover all three cases: the fragment names a step,
nothing is named and step 1 stands, or the script has marked one. The pill
rail carried a dead rule for this, `[aria-selected='true']`, which the script
has never set, so no pill has been lit since the hero shipped. The counter now
reads `6 of 12` rather than `6 / 12`.

**The captions are plain.** No uppercase, no tracking. The tree pane says
`triage/` and the count of files in it, and the row that repeated `triage/`
inside the pane is gone. A file pane says the path inside the assembly with
the step's title beside it. The check pane says its command, and the row that
repeated the command inside the body is gone with it. The run pane already
said its command and now looks like the others. `The folder it left` and
`The memo it wrote` lost their uppercase too.

**The breakpoint stays at 62rem.** 768 is one column, which is what the shots
say it wants: twelve pills fit one row there with no scrolling, and two columns
at that width would leave the file body under 400px. 1024 takes two columns and
holds. Below 75rem the rail narrows to 11rem and the band's gutter to 4rem,
which buys the file body 144px at 1024; past 75rem the rail returns to 13.5rem.
The tree column stays 16rem at every width above the breakpoint, because 14.5
wraps `01-blocker` off its `exec` and `new` tags.

**What the shots said.** Steps 1, 6, 10, 11 and 12 at 400, 768, 1024 and 1440,
light and dark, viewport height rather than full page, because a full-page shot
paints the sticky header over the middle of the walkthrough and hides the fault
being judged.

- **400.** The pill strip scrolls and the script centres the live pill, so 1, 6,
  10, 11 and 12 all sit fully on screen. The controls read as a cluster rather
  than two stretched buttons. The run pane's command used to scroll sideways
  with no bar; it wraps now.
- **768.** All twelve pills fit one row. The controls stretched full width here
  first, two buttons a screen apart; they are a left cluster now.
- **1024.** The tree row `01-blocker exec new` wrapped onto two lines and the
  file body was 400px of an 80-column file. The narrower rail and gutter fixed
  the second; the tree column had to stay at 16rem to fix the first.
- **1440.** No fault.

**A fragment no longer lands under the header.** Opening `#step-6-the-gates`
scrolled the step to the top of the window, which left the rail and the
controls above the fold and the site header over the step's first row. The step
carries `scroll-margin-top` for both.

**With the scripts stripped** the page still works: the fragment selects the
step, the pill it names is lit, the step's own Back and Next are drawn, and
step 1 stands when no fragment is given. The pill rail's `aria-current` on step
1 was server-rendered, which lit two pills at once with no script, so the
script alone sets it now.
