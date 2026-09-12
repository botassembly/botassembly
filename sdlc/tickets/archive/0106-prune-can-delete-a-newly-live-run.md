---
flow: build
priority: 8
---
# Prune can delete a newly live run

Promoted 2026-08-21 from
`sdlc/issues/0106-prune-can-delete-a-newly-live-run.md`
(severity blocking, filed by the 2026-08-20 observability review).

Prune checks record and lock state, sizes the candidate, and later
removes it without holding ownership
(`bot/src/prune-inspection.ts:187-215,229-248`). A process can
create or acquire the run between the final check and the removal,
so `--delete` can destroy a live run or its scratch — the worst
possible outcome for a runtime whose sealed record is the product.

Done, observably: no interleaving of run creation, acquisition, and
pruning can delete a live run — a run acquired after prune's check
survives, and a test witnesses the race window closed. Whether that
is a home lock serializing all three, or the candidate's ownership
lock held through revalidation and deletion, is the design's choice.
