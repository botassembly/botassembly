---
project: botassembly
date: 2026-09-11
status: unfolded
---

# botassembly.org: information architecture and interaction study

Two facts shape everything. The eleven specification pages are generated at build time by `docs/scripts/generate-specification.mjs` from `specification/*.md`, so the site is a view of the repo and nav changes edit that script plus `docs/astro.config.mjs`. And the conformance corpus is 143 cases in 1,066 files totalling **91 KB of text**, small enough to ship whole to a browser.

## 1. Information architecture

Six groups. The first two lines of the nav are the argument: **Format** is what you own, **Runtime** is what runs it.

**Start.** *What Bot Assembly is* (mental model, an assembly and a record on the page, when a script is better — Q1, Q2). *The format and the runtime* — the split page: left, files, versioned 0.0.1, 143 conformance cases, any implementation; right, `bot`, TypeScript, Node 22.22, Linux, providers, home, records; names `bot check` as the seam (Q1, Q3). *Install the runtime* (Q5, Q6). *Your first assembly* (Q5, Q8). *Run it and read the record* (Q15). `guides/first-assembly.md` splits across the last three; `guides/install-and-use.md` gives up its install and inspection halves and the rest moves to Runtime.

**Format — the specification.** The eleven generated pages, unchanged except two splits in the generator. *The Graph* concatenates seven sources and should become Graph / Containers / Subflows. *Running* concatenates four and should shed `prompt.md`: "what the agent is actually told" is Q9 and needs its own URL. Answers Q8-Q12 and Q19 in part.

**Runtime — bot.** The existing `reference/` pages: *Installing and using an assembly* (what remains of `install-and-use.md`), *Invocation*, *Models and intelligences* (Q6), *Agent tools* (Q9), *Auth and credentials* (Q18), *Inspection* (Q15), *Management*. Three new: *Resume and what it does not restore*, lifted out of `reference/invocation.md:102-110` where it is invisible (Q13); *Trust boundary*, promoted from `README.md:56-58` and `principles.md:42-44` (Q17, Q18); *Limits and cost* — no run-wide budget or deadline (Q16).

**Guides.** Authoring an assembly (from `guides/authoring-assemblies.md`); Gates in any language, where `$1` is the output file (Q7); Testing an assembly, the three layers (Q19); Human approval as two flows (Q14); How it compares — LangGraph, a shell script, a prompt folder (Q2, Q3, Q4).

**Principles.** `principles.md` unchanged; carries the argument behind Q2 and Q9. **Project.** Development; *Status and compatibility* — pre-1.0 contracts may change, what a pilot should not do (Q20); Changelog.

## 2. Getting-started path

Seven pages, each ending in something run or seen.

1. **What Bot Assembly is** — sees a four-file assembly and a six-line record before installing anything.
2. **The format and the runtime** — watches the refusal explorer refuse a broken assembly in the browser; refusal is a property of the format.
3. **Install the runtime** — runs `bot models openai-codex`, writes one `default` intelligence, runs `bot auth`.
4. **Your first assembly** — four files, then `bot check ./reading-list/digest`: one line per stage with a `from` rung on every option. No model, no money.
5. **Run it and read the record** — pipes an article in, then `bot run list` and `bot run show RUN -j`.
6. **Add your first gate** — a `gate` that fails, watches the send-back in the record, fixes it, watches it pass. This is where the pitch becomes real: a deterministic check overrules an agent.
7. **Make it yours** — own stages, `bot assembly link`, hands it over with `bot assembly install`.

## 3. Interactive components, by value ÷ cost

The site is stock Starlight with no UI framework (`docs/package.json`: astro, starlight, sharp). Every component below is a plain `<script>` island plus a build-time JSON file.

**A. Refusal explorer** — highest value, low cost. Reader picks a fault from 108 refuse cases and sees the file tree, the offending bytes, and the code + path the runtime must produce. Learns that refusal is a fixed vocabulary and the spec is executable. Data all exists (`specification/conformance/refuse/*/`). Risk: picking ~20 legible cases for the default view.

**B. Assembly explorer with live check output** — high value, low cost once A's extractor exists. Clicks through an accept case's tree (35 cases) and sees beside it the exact `bot check --json` lines that folder produces, `from` rung badged on every option. Best available answer to Q8 and Q10.

**C. Corpus dashboard** — good value, trivial cost. Searchable table of all 143 cases: name, group, accept/refuse, code asserted. Same JSON. Risk: counts must be derived — `conformance.md:190` says the prose must not name counts, and `conformance.md:9` already hardcodes 143.

**D. Record timeline** — high value, medium cost. Scrub a run event by event: what the stage was told, what judged it, what it cost. `specification/conformance/records/v1/record.jsonl` exists but is a 6-event synthetic fixture — enough to build against, too thin to persuade. The real version needs a run captured from `smoke/` and scrubbed, which costs a model call, and the pre-1.0 record shape needs a check keeping the fixture current.

**E. Terminal replay** — moderate value, trivial cost. Canned typed-out output for `bot check`, `bot run`, `bot run show -j`, with copy buttons, on the Start pages. Wire it to fixtures the runtime tests already assert on, or it drifts.

**F. Rung playground** — moderate value, medium cost. Toggle `intelligence:` across the eight rungs and watch the resolved value and its `from` word change. Cheap version: precompute every outcome for one small assembly and do pure lookup. **G. In-browser `bot check`** — highest ceiling, highest cost; a spike, not a launch item. **H. Frontmatter linter** — low value, only worth doing as a byproduct of G.

Order: A, B, C on one extractor, then E, D, F, G.

### Is an in-browser `bot check` feasible?

Yes, and closer than it looks. `bot/src/reader.ts:114` already exposes `check(source, dir, env) -> {exitCode, lines}`: pure, synchronous, environment injected, 22 modules and 3,843 lines. It spawns no process, opens no socket, contacts no model, and touches none of `pi-agent-core`, `pi-ai`, or `proper-lockfile`. Its npm deps, `yaml` and `ajv`, are browser-safe as they stand.

Four things stand in the way. **No filesystem port**: `fs` is called directly at ~17 sites across five files, and `Dirent` objects travel as values (`bot/src/assembly.ts:15,87`, `graph.ts:181`, `stage.ts:154`), so an in-memory tree must fake `Dirent`, not just bytes. The port needs three operations and `bot/src/documents.ts:57-79` is already nearly it. Mechanical, and the bulk of the work. **The executable bit**: `bot/src/documents.ts:301` tests `mode & 0o111` to raise `not-runnable`; a browser tree needs a per-entry flag or a documented divergence on that one code. **A false dependency**: `bot/src/invocation.ts:8` imports `hashBytes` from `record.ts`, which check never calls, dragging in `node:crypto`, `node:fs/promises`, `node:stream/promises` and 326 lines of record machinery. **One ambient host call**: `bot/src/invocation.ts:58` falls back to `homedir()`; make `HOME` a required env field and `node:os` goes away. `node:path` needs a ~60-line POSIX shim; the codebase is POSIX-only already.

Size: ~130-150 KB minified (~45 KB gzipped) without `ajv`, which check does not need; ~250-300 KB with it. The decisive argument is the oracle. `bot/tests/conformance.test.ts:63-67` already loads each case as a directory plus an env and compares JSONL byte for byte, 143/143 green. Point that harness at the in-memory implementation and the equivalence test is free. The port pays twice: on the site, and as a second implementation proving the format is portable, which is the claim the corpus exists to make. Still a spike: it is the only component whose cost is runtime refactoring rather than docs work, and A, B and C deliver most of the same understanding from prebuilt JSON.

## 4. Three things that block or mislead a first-time reader

1. **Two contradictory install recipes on two Start Here pages.** `docs/src/content/docs/guides/install-and-use.md:31-35` says `git clone`, `make -C botassembly/bot install`, `make -C botassembly install`. `guides/first-assembly.md:14-19` and `README.md:11-16` say `git clone`, `cd`, `npm ci --prefix bot`, `make install`. A reader who follows both cannot tell which worked.

2. **The install guide never mentions the one thing a run cannot start without.** `install-and-use.md:49-51` states "Credentials come from your environment... Nothing goes in a config file", then contradicts itself at `:63` by naming `~/.config/bot/credentials.json`. Worse, the page never mentions `config.yaml` or `intelligences` at all — "intelligence" appears once, at `:170`, as a CLI flag. A reader who reads only this page has no `default` intelligence, so every `bot run` fails on a point the page said did not exist.

3. **The install guide teaches the legacy commands.** `install-and-use.md:230-236` teaches `bot runs`, `bot show`, `bot output`, `bot session`, `bot logs`, repeated at `:188`, `:213`, `:259`, and `guides/authoring-assemblies.md:219-221` agrees. `first-assembly.md:123-126` and `README.md:47-51` teach `bot run list`, `bot run show RUN -j`, `bot run output RUN --raw`, and `specification/conformance.md:97` calls the first set "legacy... retained for compatibility". Two of four Start Here pages teach opposite vocabularies.

Fourth, a hard 404: `first-assembly.md:134` links `../../../../../specification/README.md` and two sibling `specification/elements/*.md` paths. They escape the content collection and resolve to nothing; the published pages are `/specification/structure/`, `/gating/`, `/record/`.

## 5. Build order

Four existing `sdlc/issues/` filings cover adjacent ground and should not be duplicated: documentation-has-never-been-assessed, home-page-does-not-pitch-the-project, docs-site-is-unthemed-starlight, no-public-examples-program.

1. **Fix the four Start Here pages.** One install recipe, the `intelligences` step present, noun commands throughout, the four broken links repaired.
2. **Restructure the nav.** `astro.config.mjs` groups become Start / Format / Runtime / Guides / Principles / Project; add "The format and the runtime"; split Graph and Running in `generate-specification.mjs`. Depends on 1.
3. **Corpus extractor.** `docs/scripts/generate-corpus.mjs` walks `specification/conformance/` at build time and emits one JSON per case plus an index (~91 KB raw), in `npm run build` beside the specification generator, failing the build on a case it cannot read.
4. **Refusal explorer and corpus dashboard.** Components A and C. Depends on 3.
5. **Assembly explorer with check output.** Component B. Depends on 3.
6. **Record timeline.** Component D, plus one real record captured and scrubbed as a checked-in fixture.
7. **In-browser check spike.** Timeboxed; produces a decision note in `sdlc/planning/`, not a feature.

Lanes: 1 → 2 is the content lane; 3 → (4, 5 in parallel) is the data lane; 6 is its own lane and parallel throughout; 7 blocks nothing.
