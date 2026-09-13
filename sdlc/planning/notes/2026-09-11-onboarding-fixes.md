# Onboarding review, the fix round

A fresh agent walked botassembly.org as a non-programmer and wrote up what it
believed at each page. Seven items came back with rulings. This is what changed.

## 1. The clinical residue is gone, and a test holds the line

`/guides/install-and-use/` ran its whole example on clinical trial screening:
`bot run trial-screening/screen "NCT05123456: does this patient match?"`, a task
file called `patient-042.md`, an install from `acme/curation-bots`.
`/guides/authoring-assemblies/` taught the folder shape with a tree named
`trial-screening/` and a checklist item about NCT ids.

Every example on both pages is now one of the four shipped assemblies, with its
real files, its real data files, and its real run ids:

- Operating runs installs `examples/triage` from this repository, runs
  `bot run triage/triage`, hands over `data/request-urgent.txt` and
  `data/request-routine.txt` three ways, and reads back the published run
  `2026-09-11T17-55-02-443e`, stage `01-classify`.
- Authoring shows the `triage/` tree whole, quotes the checklist `01-classify`
  actually carries, quotes `03-verify/gate/02-sections` as a complete gate, and
  shows `examples/brief`'s real `FANOUT.md`. The development loop runs
  `./triage/triage @data/request-urgent.txt`.

`docs/scripts/no-domain-words.test.mjs` scans every page under
`docs/src/content/docs`, generated specification pages included, and fails on
any of twenty-one words with whole-word boundaries. The boundaries matter:
`invariant` holds `variant`, `distinct` holds `nct`, and both are ordinary
prose here. Two unit tests pin the list and the boundaries so the guard cannot
rot into a guard that catches nothing. `README.md` was clean already.

## 2. One install recipe, and the operating page is reachable

The sidebar already read "Operating runs". What was missing was a way in from
the home page, so the home's runtime card now links it beside
[Your first assembly]. The install recipe stays in one place, in
`first-assembly.md`, and the operating page still points back at it. Nothing
was duplicated to close this.

## 3. Three reference pages stopped repeating the specification

`/reference/auth`, `/reference/invocation`, and `/reference/resume` were
hand-written and every sentence of them also appeared in
`/specification/running/`. They are now short pages, each under 120 words, that
say what the reader will find and link the exact anchor. No page was deleted
and no redirect was needed: all three are linked from elsewhere on the site.

`published-runtime-contracts.test.mjs` required `reference/resume.md` to restate
the whole resume contract, which is what made the duplication a rule. That arm
now checks the format's own `specification/elements/invocation.md` alone, and a
new arm checks that the reference page links the anchor and stays under 120
words. Nothing under `specification/` was touched.

## 4. Pi is defined where it first appears

One sentence in `first-assembly.md`, at the first mention: Pi is the
open-source agent SDK the runtime builds on, `bot` bundles it, and no provider
is called except through it. No repository link, because no page on the site
carries one to link to.

## 5. What a run costs

The no-provider-table ruling stands. `first-assembly.md` gains a "What it
costs" section with the token totals of the four sealed runs under
`examples/runs/`, counted from the `turn` events of each `record.jsonl`:
20,643 for `hello`, 78,962 for `triage`, 115,415 for `brief`, 109,361 for
`outline`. It names the provider and model those runs used, `google` and
`gemini-3.5-flash-lite` at reasoning `low`, and says how to turn tokens into
money.

The provider names `config.yaml` accepts are not plain in `bot/src`. They come
from Pi's built-in catalog, and what `bot/src/credentials.ts` lists is
environment variable names rather than provider ids. So the page says the
config names a provider and a model, that the accepted names are what the
machine can reach, and that `bot models` after install is that machine's own
answer. `reference/models.md` pointed at the authoring guide for the pair the
live runs use; it now points at this section, which actually carries it.

## 6. The step numbers no longer clip at 400px

The walkthrough rail was a sideways-scrolling row on a phone, so the last
visible number was cut in half and nothing said the rest were there. The rail
now wraps: twelve numbers on two rows, all of them on screen, no fade and no
scroll. Confirmed by screenshot at 400px. Back and Next stay under the steps,
as ruled.

## 7. The GitHub error page was a deploy hiccup

`/guides/first-assembly/` builds to a 72 KB page. Every asset it references is
local: three stylesheets, three self-hosted fonts, one favicon. It makes no
external request at all, and the only external URLs on it are GitHub links in
the install recipe. Nothing on the page can be slow. The unicorn the review saw
was GitHub Pages serving mid-deploy. No change.

## What Ian can overturn

- **Stub reference pages over deletion.** `/reference/auth`, `/reference/invocation`, and `/reference/resume` could have been deleted and redirected instead. They were kept because the Runtime sidebar group autogenerates from the directory and three commands would have vanished from it.
- **Narrowing the resume contract test.** It used to demand two copies of the contract. It now demands one, in the format's own document. Putting the second copy back means putting the duplication back.
- **The cost table's shape.** It reports tokens and a provider and model, not dollars. A dollar figure would need a rate written on the page, and a rate written on a page rots.
- **Wrapping the walkthrough rail rather than scrolling it.** Two rows of numbers take vertical space above the panel on a phone.
- **Pi with no link.** The sentence names Pi and stops. A link to its repository could be added to `reference/agent-tools.md` and pointed at from here.

## Gates

`npm run build --prefix docs` clean. `node --test docs/scripts/*.test.mjs` 42
pass, 0 fail. `sdlc/scripts/lint` clean. Screenshots taken at 1440 light for
both rewritten guides and the cost section, and at 400 light for the
walkthrough.
