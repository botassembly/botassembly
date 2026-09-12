---
flow: build
priority: 1
deps: []
---
# Every current issue has a disposition

## Outcome

Every issue present at ticket start either becomes separately owned release work, retains an explicit evidence trigger or review date, or leaves the active ledger with current proof that it is fixed or stale.

## Current facts

The active ledger contains 35 issue files, while the alpha plan still says 34. A read-only three-way survey against commit `678a797` produced provisional dispositions, but independent design review found that the survey misdiagnosed the brief example and counted files where some contain several distinct findings. The alpha plan also still names FANOUT option alignment even though the parser and specification now agree.

Historical brief-example evidence shows its FANOUT children succeeded. A later stage made unnecessary model-selected subflow calls that timed out. That evidence belongs with the assembly-root subflow-authority finding, subject to checking the separate question about a stage succeeding after its manual child calls fail. Existing alpha outcomes already own incomplete child token totals, authored depth above the runtime ceiling, and current model qualification. The worktree-removal finding may belong to the repository that owns the shared development tooling.

## Scope

Recheck each survey disposition against current landed source, tests, specification, documentation, and records. Run a focused local reproduction only when those artifacts do not settle the status. Do not use live credentials, provider calls, or paid services.

Give every distinct finding a disposition. Attach confirmed release defects to an existing alpha outcome or add one ordered plan outcome when no owner exists. Keep later opportunities and unresolved observations as issues with a brief status plus an evidence trigger or review date. Remove fixed or stale issue files only after the completion record cites the original path at the starting commit and the landed source, test, or record that resolves it. Transfer any finding owned by another repository into that repository's `sdlc/issues/` before removing it here.

Reconcile the alpha plan's issue count, release-ticket count, and now-aligned FANOUT option outcome. Do not fix a product defect, create drafts, or create several pending tickets. After this ticket closes, shape only the first newly ordered or previously planned release outcome that should run next.

## Acceptance

Every distinct finding in all 35 starting issue files has one disposition in the completion record. Each fixed or stale disposition cites the original path at the starting commit and its resolving evidence. The active issue directory contains only retained observations and later opportunities, and every remaining file states what evidence or date causes its next review. A finding owned elsewhere exists in its owning repository before it leaves this ledger. The alpha plan names existing or newly ordered owners for every confirmed release defect, reports current issue and base-ticket counts, and no longer claims the already-aligned FANOUT option contract is broken. Only one next ticket becomes active after 0264 closes. Project lint and `git diff --check` pass in each changed repository.

## Dependencies

None. Roadmap order places this after ticket 0263. Local evidence classification does not technically depend on that implementation.

## Risk facts

An incorrect stale classification can hide a release defect. A broad promoted ticket can mix unrelated contracts and defeat independent review. Reproductions that reach a provider could spend money or read credentials, so this ticket permits only local evidence.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 1
- Cost of error score: 1
- Total: 4
- Minimum level floor: none
- Final level: 2
- Reasons: The change spans the issue ledger and planning documents and must preserve a traceable disposition for every distinct finding. It changes no product behavior or external state.
- Selected model: `gpt-5.6-luna` with high reasoning

## Review

- Design review: accepted after one rejection. The first design counted files instead of distinct findings, misdiagnosed the brief example, duplicated an owned depth outcome, proposed several active tickets, and left cross-repository ownership unclear. The accepted design requires a traceable disposition per finding, preserves only triggered issues, transfers foreign ownership, records new work as ordered plan outcomes, and activates one next ticket after closure.
- Code review: pending
