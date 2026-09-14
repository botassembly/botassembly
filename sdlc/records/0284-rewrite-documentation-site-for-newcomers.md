---
base: bcb560718e0303f296af1e3f15c86c4a9f565893
head: c29c920391bd27fa7a9ad1dfeeb27cc6aaf3dbb3
---

# The documentation site now reads as six groups a newcomer can follow

The sidebar is now six groups: Start, Build, Operate, Understand, Reference, and Project. Start runs the home page through why not a script, install, the shipped example, and a first assembly of the reader's own. Build holds stages and checks, control flow, skills and slots, sharing an assembly, and the assembly explorer. Operate holds reading a record, providers and credentials, when it refuses or fails, the refusal explorer, and before you pilot it. Understand holds a folder in a record out, the format and the runtime, and principles. Reference holds one command table and the generated specification collapsed into one entry. Project holds development and testing.

Seven pages are new: why not a script, run the shipped example, write your own, stages and checks, control flow, sharing an assembly, and when it refuses or fails. Six pages moved: reading a record, providers and credentials, before you pilot it, a folder in a record out, the format and the runtime, and principles. Nine authored pages are retired into these replacements: first-assembly, install-and-use, authoring-assemblies, invocation, resume, trust-boundary, agent-tools, limits, and the back half of management. Sixteen redirects cover every retired slug, and `docs/scripts/redirects.test.mjs` proves each one against the built HTML. `docs/scripts/sidebar.test.mjs` proves one group per page and a resolving target for every root-relative link. `docs/scripts/check-links.mjs` walks the built site and follows every internal link and anchor.

The writing rules apply to every authored page: one fact per sentence, subject, verb, object, a term defined at first use, one job per page, no sentence about the site or the page itself, and no em-dashes. Every transcript in the rewritten pages is reproduced by running the command, not copied from memory or an old page.

The rewrite removes accuracy problems 2, 5, 7, 8, 9, 10, and 11 from the 2026-09-14 site assessment: the 0.0.1 release claim, the release-candidate WSL milestone, the WSL behavior assertion in the principles, the two contradictory credential routes, the pinned Pi version, and the release-note prose about the current implementation. `sdlc/scripts/install` now runs `npm ci --prefix docs` beside `make -C bot install`, because `redirects.test.mjs` and `sidebar.test.mjs` build the site and read its output.

Independent design review rejected the first draft because it carried two outcomes, the accuracy pass and the structural rewrite, in one ticket. The accepted design split the work: this ticket rewrites the structure and prose, and ticket 0285 owns the accuracy pass and the transcript pin. Design review then accepted the split design.

Independent code review rejected the implementation twice before accepting it. The first rejection found a fabricated refusal transcript, an undefined term left on an authored page, two self-referential sentences describing the site to the reader, a weakened test assertion, and structure tests that checked the sidebar configuration without reading the built HTML. The second rejection found a race between two tests that both build the site at the same time, and two example transcripts that did not reproduce when the reviewer ran the commands. The repair serialized the two building tests and replaced both transcripts with fresh command output. Code review then accepted the implementation.

The complete local gate passed on this commit: `make check` exited 0 with 158 repository and documentation tests, 210 runtime test files totaling 1,707 tests, all 143 conformance cases, static checks, and coverage collection.

Hosted runtime run `34843478497` passed on commit `c29c920`. Hosted docs run `34843478569` passed on the same commit, including the build job and both platform check jobs.

Four accuracy problems from the assessment stay open: problems 1, 3, 4, and 6, and the example transcript test that pins runtime output, belong to tickets 0282 and 0285. This ticket's acceptance read-through was one reviewer reading the Start path as a newcomer, not a user study, and the finding is recorded as a code-review finding rather than as broader evidence about real first-time readers.
