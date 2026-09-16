# Hand-off, 2026-09-14: admin surface and library sequence

Ian stopped the session for budget. This note says where the sequence from the [admin surface and library requirements note](2026-09-14-admin-surface-and-library-requirements.md) stands, so the next session can resume without rediscovery. Delete this note when every item below is resolved.

## Landed on main

Tickets 0287 through 0302 are complete, recorded, and archived. Ticket 0300 exported nine mutating byte readings. Ticket 0301 made all seven package paths installable with emitted ESM JavaScript and generated declarations. Ticket 0302 added typed document functions for all 21 structured public counterparts while preserving exact byte readings. The four raw counterparts remain byte readings. `auth.list` and `model.list` stay outside the public counterpart set because they require the Pi runtime.

## Next outcome: release qualification

The selected implementation queue is exhausted. The active-ticket, issue, and draft directories contain no work after the 0302 completion record. Shape the single release qualification ticket only after this record commit's main runtime and documentation workflows pass and main still matches origin. The release rule in `sdlc/planning/plan.md` defines its proof. Publishing `v0.1.0` still requires Ian's final authorization.

## Housekeeping

Every worktree under `worktrees/botassembly-*` is registered and stays. The record branches `record/0293` through `record/0297` were merged and deleted on origin. Gate tools in a fresh worktree need `sh sdlc/scripts/install` before lint.
