# Hand-off, 2026-09-14: admin surface and library sequence

Ian stopped the session for budget. This note says where the sequence from the [admin surface and library requirements note](2026-09-14-admin-surface-and-library-requirements.md) stands, so the next session can resume without rediscovery. Delete this note when every item below is resolved.

## Landed on main

Tickets 0287 through 0300 are complete, recorded, and archived. Ticket 0300 exported nine mutating operations. Seven assembly and authentication mutations use the shared in-process command boundary; `run.start` and `run.resume` use direct children with bounded failure cleanup. The operation inventory is 27. Twenty-five operations now have public counterparts. `auth.list` and `model.list` stay pending export because they need the Pi runtime.

## Next ticket: package types and compatibility

Draft the plan item 24 ticket. Declare `types` for every export path in `bot/package.json` and record the pre-1.0 compatibility rule. Do not implement before independent design review accepts the ticket.

## Then

After package types and compatibility, add the typed layer over the byte readings.

## Housekeeping

Every worktree under `worktrees/botassembly-*` is registered and stays. The record branches `record/0293` through `record/0297` were merged and deleted on origin. Gate tools in a fresh worktree need `sh sdlc/scripts/install` before lint.
