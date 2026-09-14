---
flow: build
priority: 2
deps: []
---
# Rewrite the documentation site for newcomers

## Outcome

A newcomer follows one journey on the rebuilt site: the landing page, a running shipped example, their own assembly, reading a record, handling a refusal. No authored page uses a term before defining it, and no step links into the specification. Every retired URL redirects to its replacement.

## Current facts

Verified at HEAD `9699a10`.

- 69% of the site's words and 13 of 30 sidebar entries are generated specification.
- `guides/first-assembly.md` asks for nine prerequisites and about 700 words before the reader writes a file.
- The site names `triage/triage` eleven times and names `greet`, `plan`, or `brief` zero times, so a reader who follows it to `hello` types a target that does not exist.
- "Intelligence", "Pi", "slot", "rung", and "sentinel" appear on authored pages before definition, or only in the specification.
- No guide links to `/format/refusals-explorer/`, and there is no troubleshooting page.
- Authored pages carry the accuracy problems this ticket owns: the `0.0.1` release claim at `format-and-runtime.md:14,42` and `project/development.md:16`; the release-candidate WSL milestone at `index.mdx:69`, `install-and-use.md:28`, and `first-assembly.md:12`, against `principles.md:28` asserting WSL as checked; two credential routes at `install-and-use.md:36`, `:41`, and `first-assembly.md:64`; the Pi `0.85.1` pin at `reference/auth.md:31`; release-note prose at `auth.md:43-55` and `inspection.md:84`.
- `docs/scripts/generate-specification.mjs` wipes and rewrites `src/content/docs/specification/` on every build. `navigation.test.mjs` parses the sidebar out of `docs/astro.config.mjs`.

## Scope

Rebuild the sidebar as six groups. Each page does one job.

- **Start.** *What it is* (home): land the idea and show a folder becoming a record. *Why not a script*: answer "compared to what", from the README's four questions. *Install*: get `bot` working, proved by one `bot assembly check` that calls no model. *Run the shipped example*: first run, first record. *Write your own*: four files, check, one run, from `examples/hello`.
- **Build.** *Stages and checks*. *Control flow*. *Skills and slots*. *Sharing an assembly*. *Explore an assembly*.
- **Operate.** *Reading a record*. *Providers, models, and credentials*, which defines "intelligence" once. *When it refuses or fails*, a new page covering exit 1, exit 2, signal exits, the 0700 home fault, and the flow-name trap. *Explore a refusal*. *Before you pilot it*, merging trust boundary, agent tools, and limits.
- **Understand.** *A folder in, a record out*. *The format and the runtime*. *Principles*.
- **Reference.** *Command reference*, one table. *Specification*, the generated pages in one collapsed group.
- **Project.** *Development and testing*.

Merges, moves, and cuts: `first-assembly.md` and `install-and-use.md` split across Start, Reading a record, and When it refuses or fails. `authoring-assemblies.md` splits across Build. `invocation.md` and `resume.md` become the command reference. `trust-boundary.md`, `agent-tools.md`, and `limits.md` merge into Before you pilot it, which takes the home caution box. Cut the back half of `management.md`, the release-note prose, and `reading-list`. `AssemblyExplorer` moves to Build, `RefusalExplorer` to Operate, and `Walkthrough` stays home.

Every authored page that changes slug keeps a redirect to its replacement. No retired `/guides/` or `/reference/` URL 404s.

Writing rules for authored pages, not generated ones: one fact per sentence; subject, verb, object; define a term at first use; one job per page; no sentence about the site or the page itself; no release-note prose; no project-internal milestone; no per-page taxonomy disclaimer; transcripts only from real command output.

Accuracy problems this ticket removes, numbered from the assessment: 2, 5, 7, 8, 9, 10, and 11. Problems 1, 3, and 4 turn on runtime output that tickets 0281 and 0283 change, so ticket 0285 owns them. Problem 6 lives in `specification/`, which ticket 0282 owns.

Out of scope: `bot/src`, `specification/`, example transcripts, and the blog's historical post except one provenance line if the rewrite makes it inaccurate.

## Acceptance

- `cd docs && npm run build` exits 0 with no new warning.
- A new test lists every retired authored slug, proves each has a redirect, and proves each target builds.
- `node --test docs/scripts/*.test.mjs` passes. `navigation.test.mjs` moves with the sidebar and still proves one group per page and a resolving target for every root-relative link. `no-domain-words.test.mjs` keeps the biomedical vocabulary guard unchanged. `published-runtime-contracts.test.mjs`, `extract-walkthrough.test.mjs`, `extract-corpus.test.mjs`, `generate-specification.test.mjs`, and `models-migration.test.mjs` move with the text they pin. The walkthrough keeps its synthetic-evidence and defined-words proofs.
- A scripted link check of the built site reports no broken internal link or anchor.
- `make check` passes.
- One reviewer reads the Start path as a newcomer, without the repository open, and records that read-through as a code-review finding.

## Dependencies

None. This ticket starts now in a parallel worktree. Ticket 0285 follows it, after 0281 and 0283.

## Risk facts

Every published URL under `/guides/` and `/reference/` changes. A missed redirect breaks an external link and a search result. Merging reference pages loses per-page anchors other pages cite. The restructure reddens `navigation.test.mjs` until that test moves with it.

## Size decision

Production size does not change. This ticket edits `docs/` content, `docs/astro.config.mjs`, and documentation tests.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 2
- Proof score: 2
- Cost of error score: 1
- Total: 6
- Minimum level floor: none
- Final level: 3
- Reasons: Reach scores 2 for a deployed public URL surface that is retired and republished. Proof scores 2 because the redirects prove compatibility with the old paths.
- Selected model: the rubric routes level 3 to the build tier, and Ian's mapping sends build work to Opus. `claude-opus-5` with medium reasoning implements. Independent design review and code review also use `claude-opus-5` with medium reasoning.

## Review

- Origin: plan outcome 14, from `sdlc/planning/notes/2026-09-14-review-docs-site.md`. Design review rejected the first draft for carrying two outcomes, so the accuracy pass and the transcript test became ticket 0285.
- Deviation: the review proposed publishing the draft blog post as the Understand page. That post is out of scope, so the page is written fresh from the home page's story.
- Design review: accepted after one rejection and a split.
- Code review: pending
