# Align the destination and the remaining repairs

Date: 2026-09-08. Owner: Bot project lead. Ian requested the ideal-state convention, document alignment, a checked backlog, and a plan for today.

## Ideal-state convention

Decision: use the fewest plain bullets grouped by category, followed by about ten prioritized gaps. Early gaps name narrow current work; later gaps group larger unfinished outcomes. The SDLC plan holds details and evidence.

Options: keep the previous 40–50-bullet target and separate status sections, or follow Ian's concise destination-and-gaps shape. Ian selected the latter. Cost: the summary omits detailed methods and the full backlog. Readers follow the plan for those.

The Bot document covers the specification, runtime, control graph, procedure files, checks, and records. It does not explain consumer workflows. The repository README describes current use; it labels the pending first-use repair instead of publishing it as implemented.

## Repair order

Decision: repair provider error reporting with 0200, then compare 0201 before the remaining repairs. Run 0218 before 0181, then continue with the other requested readings, storage and portability, and unnecessary complexity. Later model experiments wait until the known repairs settle.

Options: run every repair before comparing models, compare 0201 now, or run model experiments before the repairs. The lead selected the early 0201 comparison to get evidence before assigning the remaining work. Cost: the comparison delays some known repairs and temporarily freezes main. Ian can overturn the order of independent repairs with a plan edit. No new hard dependency is implied.

External-review correction: run 0201 and 0218 before 0181. They supply missing interfaces for caller migration; the retry test passed during the last complete check. Options were to fix the intermittent test first or finish the requested readings first. The lead selected readings first after the early 0201 comparison. Cost: a known flake can recur in the intervening checks. A recurrence that blocks work is the reason to move it forward.

## Ticket corrections

- Preserve public package exports during module folding. Internal import counts alone cannot prove dead code. Cost: a small public entry module can remain.
- Ban tests of planning prose while preserving tests of executable project scripts. The rejected blanket SDLC ban would remove useful behavior coverage. Cost: the enforcement must distinguish those cases.
- Store search indexes in the operator's XDG cache and distinguish resolved home paths. Leave old in-home indexes untouched during reads. Moving or deleting them would violate read-only search. Cost: old disposable files remain until deliberate cleanup, and moving a home rebuilds its cache.
- Exclude hidden entries from both Git and local installs. Git currently removes only root `.git`. Cost: assemblies cannot depend on hidden transport files. Ian can reverse this behavior before implementation.
- Add runtime identity to the existing capability inventory. Replacing the human result with one line would lose discovery information. Cost: the reading grows by one line.
- Count actual send-backs instead of every failed check. Blockers and final failures do not all return to the agent. Cost: the future reader must establish the attempt sequence or report insufficient evidence.
- Preserve shared behavior tests during legacy deletion. Old-spelling usage is not permission to remove an entire test file. Delete the temporary ledger with the old interface as Ian already ruled; preserve the ADR and Git history. Cost: future historical audits use Git.
- Remove all source-inventory quotas in 0219. Retaining the byte cap without a supported need would leave another program-growth startup failure. Cost: hashing work grows with the trusted installed source tree. Preserve framing, record meaning, ordinary read errors, and child reuse. Update the specification with the implementation.
- Add exact lint-path openings to 0205 and 0216. Cost: those tickets can modify that gate, subject to review.

These draft corrections are reversible before implementation. They do not authorize changes in another repository or remove deployment conditions.

## Planning ownership

Decision: make `planning/plan.md` the current entry point and preserve the old questions and punchlist as explicitly historical snapshots. Keep compatibility pointers at their former paths. Options: maintain several competing lists, delete old evidence, or consolidate direction while retaining evidence. The lead chose consolidation. Cost: one archive remains for the later discrepancy review.

The earlier “no resume” statement and per-file-cap advice are superseded. Named-intelligence precedence already has tests. Real invocation qualification and delegation quality remain separate work. No speculative runtime feature becomes a ticket merely because the ideal mentions it.

## September 6 rulings, preserved in full

The following text restores the accepted choices from the earlier cleanup plan. The source is commit `a7f3433c`, `sdlc/planning/bot-contraction/final-cleanup-plan.md`. The recovery keys referenced in ruling 5 are immediately below. Today's priority order and corrected test boundary appear above.

Ian accepted each recommendation. Each is reversible through Git or one line of configuration.

1. **Legacy deletion trigger.** Delete when the replacements go live, outright, with no transition table and no release deadline. Cost accepted: two CLIs in `--help` until then. Rejected: delete now (breaks the running workflow and dashboard clients); never delete (contradicts ruling 4 and ADR 0026).
2. **Noun surface size.** A noun command exists only for an observed caller. Cost accepted: the 22 removed matrix rows must be re-planned if a caller appears. Rejected: build the whole matrix (about two thousand lines with no consumer for most).
3. **Per-file line cap.** Dropped, applied in ticket 0056 when the merge pushed two files over it. Cost accepted: no second alarm on one large file; the total ratchet and size decisions still bound the whole. Rejected: raise to 600; keep.
4. **Identity.** Auto-initialize on first run, delete `home init`, contract the module to the trust boundary. Cost accepted: the explicit init step goes, and nothing consumed it. Rejected: revert the ticket; keep the hard stop and document an init step per machine.
5. **Retired drafts and dead branches.** Retired and deleted. Cost accepted: Git history is the only copy; the branch tips above are the recovery keys.

Taken here without asking, overturnable: the plan lives in this folder; drafts stay in the drafts folder for the manual workstream to copy in; 0201 became a noun command because two callers exist; the archive move used `git mv`; the lint rules in this plan and in 0216 are the mechanical form of two conventions this review found broken.

## Deleted-branch recovery keys

The previous cleanup plan recorded these five tips. Each object was still present when checked on 2026-09-08. A written hash helps locate an object; it does not itself protect the object from garbage collection.

`git for-each-ref --contains` also verified that every tip remains reachable from an existing local branch. The first is on `main` and `origin/main`; the others retain local branch refs. The external review's claim that all five are unreachable is incorrect. No new recovery ref is needed while those branches remain.

| Deleted branch | Full commit | Earlier recorded purpose |
| --- | --- | --- |
| `worktree-docs-and-cleanup` | `e46931159b714fb2b9e66faff7be4865da11652f` | Merged documentation and cleanup work |
| `pressure-test-fixes` | `61bcdf71348029c69351ba3b38db781d211fe707` | Five August 25 commits; changes landed through ticket 0141 |
| `orphan/0024-second-flight` | `b32b2d2efae5fa233230f0deec45443d0d68fc8b` | Earlier completed-ticket attempt |
| `orphan/0022-refused-work` | `89ab4d43a293ce3475ac8b7207e24a8b2bfcab8c` | Earlier refused attempt |
| Staging branch; original name not recorded | `5549be53b7c72dc4b6bdd7654d3ce498ff52a8c6` | Two August 10 changes recorded as already on main |

## Scope of the storage draft corrections

0203: the old ticket required a reusable search index and a byte-for-byte unchanged searched home. Those requirements already imply storage elsewhere. Options include an explicit caller-provided cache location or the operator's standard XDG cache. The lead selected XDG cache to avoid a new required setting. Cost: copying or moving a home can require rebuilding the cache, and old in-home indexes remain until deliberate cleanup. Ian can overturn the location before implementation.

0204: the old draft already required Git and local installs of the same committed tree to produce matching copies. Its explanation wrongly assumed that Git installs discarded all hidden entries. The correction makes the implied Git behavior change explicit. Options are to exclude hidden entries from both transports, limit exclusion to local installs and drop parity, or copy hidden entries through both transports. The lead retains exclusion from both because the format excludes those entries from its graph and hashes. Cost: a Git-installed tool that relies on a hidden file can break. Before implementation, review Bot's tracked install fixtures and documented examples for that dependence and name the changed transport behavior in the specification. This remains a draft, and no installed assembly has changed. Ian can reverse the choice before implementation.
