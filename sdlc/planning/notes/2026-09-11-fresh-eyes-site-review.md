---
project: botassembly
date: 2026-09-11
status: unfolded
---

# Fresh-eyes review of botassembly.org

A reviewer with no prior knowledge read all 23 pages in site order plus the public repo, as a team lead wanting a repeatable document-screening agent. Findings, blunt by request.

## Understanding

The home page delivers the idea in about forty seconds. The reader could not act on it until `/specification/example/`, five pages and about twenty minutes in. That page should be page two.

## Building the screener from the docs alone

1. Install: blocked-ish. `/guides/first-assembly/` and `/guides/install-and-use/` give different commands and neither acknowledges the other. The repo README gives a third. Clone-only, no package, no release, no tag.
2. Scaffold one flow: clear, from the authoring guide and the worked example.
3. Structured verdicts per criterion: clear, `schema.json` or `schema.md` in gating. The cleanest part of the system.
4. Screen N documents in one run: blocked. The authoring guide says containers are LOOP, CHOOSE, PARALLEL and tells the reader to hand-roll fan-out. `/specification/graph/` has FANOUT, provisional, root-only, capped at 32, and the authoring guide never mentions it.
5. Hand it to a teammate: guessable. `bot assembly install <git-url>#subdir` exists, with no versioning or pinning.

## Ten questions in order

1. What does a run record look like? Prose only, never a pasted example.
2. How do I install? Three variants.
3. Which CLI is real, `bot show` and `bot runs` or `bot run show` and `bot run list`? The inspection reference lists both without guidance. The conformance page calls the first set legacy. The install guide teaches only the legacy set.
4. Is `reasoning: max` valid? First-assembly lists low, medium, high, xhigh. The worked example uses max.
5. Where is a real assembly to copy? Only smoke and conformance fixtures.
6. What is an intelligence? Used on the home page, defined on the second-to-last page.
7. Can I restrict what the bash tool runs? `access:` is in structure and the README, absent from the authoring guide.
8. How do I cap cost? Install-and-use says nothing bounds a run as a whole. Honest, and disqualifying for unattended batch work.
9. Is it maintained? Repo one day old, zero releases, learned from `gh`, not the site.
10. Does CI prove it? README says hosted checks prove it. `/project/development/` says there is no hosted CI.

## Reading order wanted

1. What this is, with a real folder and a real record excerpt on screen.
2. Install and run the shipped example.
3. The worked example, promoted from position six.
4. Authoring assemblies, absorbing fan-out and `access:`.
5. Gating.
6. Operating runs and reading records, merging install-and-use with the inspection reference.
7. Graph, structure, record, running, for people who need law.
8. Principles last. It is an essay, not onboarding.

Merge the two install sections and pick one CLI spelling. Cut the overview tables: 34 rows pointing at 11 pages with no anchors. Split running (50 KB, four topics) and structure (35 KB, four documents).

## Trust

Up: 237 test files and a real accept and refuse corpus. The exit-code contract and the admission that no run budget exists. "Bot is not a sandbox" stated flatly.

Down: three install recipes, two CLIs, a README that contradicts the development page about CI. Upgrade advice about launchers installed before 2026-08-05 on a repo one day old. Zero copyable examples, with the needed primitive provisional and absent from the authoring guide.

## Ten seconds

A folder tree and eight lines of a record, side by side, above the fold. One sentence on what it does not do. One command that produces that record locally. The reviewer would have closed the tab at the second install block in install-and-use.
