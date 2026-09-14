---
flow: build
priority: 2
deps: [0283]
---
# Rewrite the documentation site for newcomers

## Outcome

A first-time reader goes from the landing page to a running shipped example, then to their own assembly, then to reading a record and handling a refusal. Every term is defined before use. No step on that path sends the reader into the specification. The site keeps every accurate claim, removes the eleven accuracy problems the 2026-09-14 review lists, and adopts the reviewed page structure.

## Current facts

- 69% of the words and 13 of 30 sidebar entries are generated specification.
- `guides/first-assembly.md` asks for nine prerequisites and about 700 words before the reader writes one file.
- The site teaches `<assembly>/<flow>` with only `triage/triage`. The other shipped flows are `greet`, `plan`, and `brief`, so a reader who follows the site to `hello` gets `The assembly is not valid.` and nothing more.
- "Intelligence", "Pi", "slot", "rung", and "sentinel" appear before definition, or are defined only in the specification.
- No guide links to `/format/refusals-explorer/`, and there is no troubleshooting page.
- The site announces released version `0.0.1`. Nothing is published and the release rule names `v0.1.0`. Five pages leak the internal WSL clean-clone milestone into user prose.
- `docs/scripts/generate-specification.mjs` wipes and rewrites `src/content/docs/specification/` on every build, so no fix belongs in those eleven pages.
- `sdlc/scripts/examples` runs `bot assembly check` for each example and discards stdout. Each example README carries a transcript, and `docs/scripts/walkthrough-steps.mjs` republishes one on the site. No check compares a transcript to real output (review note M8).

## Scope

Rebuild the sidebar as six groups. Each page does one job.

- **Start.** *What it is* (home): land the idea and show a folder becoming a record. *Why not a script*: answer "compared to what", from the README's four questions. *Install*: get `bot` working and prove it with one `bot assembly check` that succeeds and calls no model. *Run the shipped example*: first run, first record. *Write your own*: four files, check, one run, from `examples/hello`.
- **Build.** *Stages and checks*. *Control flow*. *Skills and slots*. *Sharing an assembly*. *Explore an assembly*.
- **Operate.** *Reading a record*. *Providers, models, and credentials*, which defines "intelligence" once. *When it refuses or fails*, a new page covering exit 1, exit 2, signal exits, the 0700 home fault, `intelligence-unresolved`, and the flow-name trap. *Explore a refusal*. *Before you pilot it*, merging the trust boundary, agent tools, and limits.
- **Understand.** *A folder in, a record out*. *The format and the runtime*. *Principles*.
- **Reference.** *Command reference*, one table. *Specification*, the generated pages in one collapsed group.
- **Project.** *Development and testing*.

Merges, moves, and cuts: `first-assembly.md` and `install-and-use.md` split across the Start pages, Reading a record, and When it refuses or fails. `authoring-assemblies.md` splits across the Build pages. `reference/invocation.md` and `reference/resume.md` become the command reference. `reference/trust-boundary.md`, `agent-tools.md`, and `limits.md` merge into Before you pilot it, which also takes the home caution box. Cut the back half of `reference/management.md`, the release-note prose in `reference/auth.md` and `reference/inspection.md`, and `reading-list`. `AssemblyExplorer` moves to Build, `RefusalExplorer` moves to Operate, and `Walkthrough` stays home.

Writing rules for every authored page: one fact per sentence; subject, verb, object; define a term at first use; one job per page; transcripts only from real command output; no release-note prose about the current implementation; no project-internal milestone; no per-page taxonomy disclaimer.

Fix the eleven accuracy problems. The check-refusal claims, the flow names, the stderr warn-once line, and check pagination are runtime facts, so reverify each by command. The version claims in generated pages come from `specification/README.md` and `specification/elements/record.md`, which ticket 0282 owns.

Add one offline test that runs `bot assembly check` for each shipped example and compares its output to the transcript in that example's README. Use the command `sdlc/scripts/examples` already runs.

Out of scope: `bot/src`, `specification/` (ticket 0282), and the blog's historical post except one provenance line if the rewrite makes it inaccurate.

## Acceptance

Start with the failing transcript test.

- `cd docs && npm run build` exits 0 with no new warning.
- `node --test docs/scripts/*.test.mjs` passes. `navigation.test.mjs` moves with the sidebar and still proves every page sits in exactly one group and every root-relative link resolves. `no-domain-words.test.mjs` keeps the biomedical vocabulary guard unchanged. `published-runtime-contracts.test.mjs`, `extract-walkthrough.test.mjs`, `extract-corpus.test.mjs`, `generate-specification.test.mjs`, and `models-migration.test.mjs` move with the text they pin. The walkthrough keeps its synthetic-evidence and defined-words proofs.
- The new transcript test fails on a hand-edited README and passes on every shipped example.
- A scripted link check of the built site reports no broken internal link or anchor.
- `make check` passes.
- One reviewer reads the Start path as a newcomer, without the repository open, and records that read-through as a code-review finding.

## Dependencies

Ticket 0283 owns the model failure text. This ticket rebases onto 0283 before its accuracy pass, so no page claims a local catalog miss proves provider retirement. Ticket 0282 owns the version statement the generated pages repeat.

## Risk facts

Every published URL under `/guides/` and `/reference/` changes. External links and search results break unless redirects are added. The transcript test binds the examples to installed runtime output, so a later runtime change reddens this gate.

## Size decision

Production size does not change. This ticket edits `docs/` content, `docs/astro.config.mjs`, example READMEs, and test scripts. It adds no runtime code.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 5
- Minimum level floor: none
- Final level: 2
- Reasons: The work is large, and each claim is still checkable against one command or one document. Proof scores 2 for the exact-output transcript comparison.
- Selected model: `claude-opus-5` with medium reasoning for design review, implementation, and code review. The rubric routes level 2 to Sonnet; Ian's workspace rule sends build work to Opus, and a site rewrite judged on prose quality is build work.

## Review

- Origin: plan outcome 12, pulled forward on 2026-09-14 and widened into a full rewrite. Evidence: `sdlc/planning/notes/2026-09-14-review-docs-site.md` and finding M8 in `2026-09-14-review-recent-work.md`.
- Deviation: the review proposed publishing the blog post `a-folder-in-a-record-out.md` as the Understand page. That post is out of scope, so the page is written fresh from the home page's story and the post stays a draft.
- Design review: pending
- Code review: pending
