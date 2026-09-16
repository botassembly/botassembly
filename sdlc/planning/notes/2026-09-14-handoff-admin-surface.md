# Hand-off, 2026-09-14: admin surface and library sequence

Ian stopped the session for budget. This note says where the sequence from the [admin surface and library requirements note](2026-09-14-admin-surface-and-library-requirements.md) stands, so the next session can resume without rediscovery. Delete this note when every item below is resolved.

## Landed on main

Tickets 0287 through 0299 are complete, recorded, and archived. Ticket 0299 added bounded literal search across retained run records and sessions without loading Pi or reaching the network. The operation inventory is 27. The library door compares sixteen read-only operations live; `auth.list` and `model.list` stay pending export because they need the Pi runtime; nine mutating operations stay pending under the child-process ruling.

## Next ticket: mutating exports

Draft the plan item 23 ticket for the nine mutating operations under Ian's child-process ruling. Replace the internals assertion at `importable-readers.test.ts:60` with one that names what stays private. Keep `run.start` and `run.resume` behind the child-process boundary. Do not implement before independent design review accepts the ticket.

## Then

After plan item 23, declare `types` plus the compatibility rule for every export path in `bot/package.json`. Then add the typed layer over the byte readings.

## Housekeeping

Every worktree under `worktrees/botassembly-*` is registered and stays. The record branches `record/0293` through `record/0297` were merged and deleted on origin. Gate tools in a fresh worktree need `sh sdlc/scripts/install` before lint.
