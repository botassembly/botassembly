# Final cleanup plan

The [current plan](../plan.md) owns the remaining work and today's suggested order. [The planning alignment decision](../decisions/2026-09-08-planning-alignment.md) preserves the full September 6 rulings, their alternatives and costs, the deleted-branch recovery keys, and the revised draft boundaries.

## Standing cleanup decisions

- Let first use create a home's identity. Preserve one identity across concurrent first runs.
- Size modules by ownership. Keep the total source ratchet and size decisions; the per-file cap is already removed.
- Test executable behavior and specification contracts. Stop pinning planning prose.
- Keep only noun commands with an observed caller. Delete old commands after the replacement callers are deployed and the ledger is closed.
- Simplify source hashing within the accepted same-account trust boundary. Preserve digest meaning.

Ian settled the first four choices on 2026-09-06. The current plan gives a recommended order without adding hard dependencies between independent repairs. Manual ticket 0072 completed the source-snapshot contraction from draft 0219.

## Current cleanup step

Manual ticket 0062 completed draft 0209 and supplied Bot source identity through `bot capabilities`. Manual ticket 0063 completed the lifecycle provenance repair for checkout umask. Manual ticket 0064 completed draft 0181 by making provider-retry tests wait for published records under a bounded deadline. Manual ticket 0065 completed draft 0203 by moving the disposable find index out of the home and binding cache reuse to held source bytes. Manual ticket 0066 completed draft 0204 by omitting source dot-entries from copied install and update. Manual ticket 0067 completed draft 0205 by removing the case-only corpus collision and enforcing that repository rule in project lint. Manual ticket 0069 completed draft 0221 by moving live smoke inspection to current commands and making token accounting fail closed. Manual ticket 0068 completed draft 0206 by normalizing smoke roots and proving both required live path forms. Manual ticket 0070 completed draft 0216 by removing planning-prose dependencies from runtime tests and enforcing that boundary. Manual ticket 0071 completed draft 0215 by folding three one-importer helpers into their owners and lowering the source ratchet to 16,051. Manual ticket 0072 completed draft 0219 by removing source-inventory quotas and same-account defenses while preserving the digest frame. Both Bot-side replacement commands still exist. Exact caller migration and deployment still gate legacy deletion. Remaining drafts wait on their recorded release conditions. Orphaned external find-cache cleanup remains a lower-priority gap and does not widen status or prune.

## Evidence and history

Completed work lives in [records/](records/). Earlier measurements and the 2026-09-06 removal account remain in Git history. They are historical evidence, not current size or queue claims.

Manual ticket 0085 names the registered worktrees that need an ownership and preservation check before cleanup. Inspect ownership, local changes, retained commits, stashes, and active use there. This plan authorizes no forced removal.
