# Hand-off, 2026-09-14: admin surface and library sequence

Ian stopped the session for budget. This note says where the sequence from the [admin surface and library requirements note](2026-09-14-admin-surface-and-library-requirements.md) stands, so the next session can resume without rediscovery. Delete this note when every item below is resolved.

## Landed on main

Tickets 0287 through 0301 are complete, recorded, and archived. Ticket 0300 exported nine mutating operations. Seven assembly and authentication mutations use the shared in-process command boundary; `run.start` and `run.resume` use direct children with bounded failure cleanup. Ticket 0301 made all seven export paths installable from the packed artifact with emitted ESM JavaScript and generated declarations. The operation inventory is 27. Twenty-five operations now have public counterparts. `auth.list` and `model.list` stay pending export because they need the Pi runtime.

## Next implementation: typed readings

Add the typed layer over the byte readings. Shape and independently review that ticket before implementation.

## Housekeeping

Every worktree under `worktrees/botassembly-*` is registered and stays. The record branches `record/0293` through `record/0297` were merged and deleted on origin. Gate tools in a fresh worktree need `sh sdlc/scripts/install` before lint.
