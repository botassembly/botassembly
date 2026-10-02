# Agent instructions for botassembly

Read `README.md`, `sdlc/README.md`, then `sdlc/planning/plan.md`. Read the workspace rules in `~/workspace/AGENTS.md`. This repo is public: name no private project or customer.

## Paused for reevaluation

Ian paused botassembly work in mid-September 2026 to build ThinkThen. On 2026-10-02 he asked for a reevaluation of the whole project against ThinkThen. `sdlc/issues/2026-10-02-reevaluate-botassembly-against-thinkthen.md` holds that work. Start no ticket that the reevaluation could make obsolete unless Ian asks for it.

## The queue owner

- One agent owns this queue. It signs tickets and approves routine ones within Ian's outcomes after review.
- The build loop is ticket, ticket review, code, code review, verify, record, land, push. A Quick Fix skips the ticket and its review.
- Reviewers are fresh, read-only, and new to the work. They return ACCEPT or numbered findings.
- Each ticket builds in `~/workspace/worktrees/botassembly-NNNN` on `ticket/NNNN-slug`. The lander removes the worktree and branch once everything is pushed.
- Mail to and from other repos goes through `pm send`, `pm inbox`, `pm replies` and `pm answer`. File pm's own gaps with `pm send pm`.

## Gates

`sdlc/scripts/` is this repo's gate ladder; its `README.md` names each rung. Run the smallest relevant rung while working and the complete gate before landing.

## Records

Tickets live in `sdlc/tickets/`, then move to `sdlc/tickets/archive/` when complete. A matching file in `sdlc/records/` marks a ticket complete. Records are append-only. Issues in `sdlc/issues/` carry a `Status:` line.
