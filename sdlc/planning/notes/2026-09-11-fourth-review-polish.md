---
project: botassembly
date: 2026-09-11
status: decided
---

# Fourth live review polish

Seven defects a fourth pass over the live site found. Every decision here can be overturned.

## 1. The blog was linked sitewide and held nothing

The only post carries `draft: true`, so `/blog/` built empty while the header title, the RSS icon, and a sidebar entry all pointed at it.

`navigation` in `docs/astro.config.mjs` is now `'none'`. That drops the header link and the mobile sidebar link the plugin injects, and it stops the plugin loading its own navigation stylesheet. The hand-written `{ label: 'Blog', ... }` sidebar entry is deleted. The plugin still adds an RSS icon to the social row whenever a feed is built, so `docs/src/styles/brand.css` ends with a rule that hides `.social-icons a[href$='/blog/rss.xml']`.

`/blog/` and `/blog/rss.xml` are still built and still answer by URL. `sdlc/planning/notes/2026-09-11-blog-setup.md` carries the one line that turns the links back on.

## 2. The corpus read like a standards body

`/format-and-runtime/` said any implementation in any language could be pointed at the corpus. `/format/explore/` said a second runtime that printed anything else fails. One runtime is two days old, so both now say what is true: the corpus is how this project keeps `bot` honest against its own specification, every change to either is run against all 143 cases, and the corpus is the door left open for a second implementation that does not exist yet. The 143, the 35 accepted, and the 108 refused are unchanged.

## 3. Three reference ledes did not fit their pages

All nine reference pages opened with the same sentence about the runtime's command surface. `limits`, `trust-boundary`, and `agent-tools` document no commands. Each now names its own subject. The six command pages keep the sentence unchanged.

The lede is one sentence with an em-dash, which is the template the other six use. Keeping the template was worth more than dropping the dash. Rewriting all nine without it is the lever.

## 4. Two sidebar groups held one link each

Starlight takes a bare link entry at the top level, so `Principles` and `Development and Testing` are now top-level links with no group heading over a single child. No merged `About` group was needed. Give either one a sibling and a group goes back.

## 5. The vtriage tree annotation was stale

`ASSEMBLY.md` declares `requests` and `runs`; the README annotation named only `requests`. Both are named now, the `runs/` line is in the tree, and the opaque-folder bullet says two. Every other claim in that README was checked against the files and holds: the two checklist items, the three schema keys, the two gates and their exit codes, the three hooks, `retries: 1` on `03-verify`, `BOT_SIM_BLOCKER`, `BOT_SIM_BADGATE`, and the 94-line record.

## 6. Two Node version phrases

`bot/package.json` sets `engines.node` to `>=22.22`, and the launcher `make install` writes says "22.22 or newer". The repository README says "Linux with Node 22.22 is the supported platform because the hosted and local checks prove it". Those are two claims: the floor the runtime enforces, and the platform the checks prove.

The home page and `/guides/first-assembly/` now both carry the README's claim about the proven platform. The lever: if the phrase should instead be the enforced floor, change all three together, README included. This branch does not touch the README.

## 7. The hero panes ended 200px apart at 1440

The tree pane ran short of the record pane. `.ba-proof` now stretches its row at the two-column breakpoint, `.ba-panel` is a column flex box, and the tree pane's `pre` takes the slack, so the two bottom edges line up and the tree still starts at the top. The tree also grew four real lines that were missing from it: `README.md`, the second request, and the published run folder. Stacked at 400px each pane is its own height again.

Verified by screenshot at 1440 and 400 in both modes. Shots are outside the repository.

## Gates

`npm run build --prefix docs` builds 31 pages. `node --test docs/scripts/*.test.mjs` passes 22. `sh sdlc/scripts/lint` is clean.
