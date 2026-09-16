# Hand-off, 2026-09-14: admin surface and library sequence

Ian stopped the session for budget. This note says where the sequence from the [admin surface and library requirements note](2026-09-14-admin-surface-and-library-requirements.md) stands, so the next session can resume without rediscovery. Delete this note when every item below is resolved.

## Landed on main

Tickets 0287 through 0298 are complete, recorded, and archived. Ticket 0298 added six resolved home paths and their point-in-time existence to `bot home show` without loading Pi or reaching the network. The operation inventory is 26. The library door compares fifteen read-only operations live; `auth.list` and `model.list` stay pending export because they need the Pi runtime; nine mutating operations stay pending under the child-process ruling.

## Ticket 0299, `bot run search`

Not drafted. The brief: literal fixed-string search over session and event files under the runs directory, spawning `rg --fixed-strings --json` when present, else `grep -rnF`, refusing with an admitted cause when neither exists; rows of run, stage, relative file, line number, truncated line; JSON document `bot.run.search` schema 1; a limit with a default and maximum; oversize refusal as 0297. Closes `sdlc/issues/2026-09-14-retired-find-left-no-text-search.md`. Copy 0297's pin list from its archived ticket: every new operation touches `capabilities.test.ts`, `cli-lazy-model-runtime.test.ts`, `help.ts`, the inventory sentence, the library contract counts, and the docs commands page.

## Then

Plan items 23 and 24: the nine mutating operations through the door with `run.start` and `run.resume` spawning a child process, and `types` plus a compatibility statement in `bot/package.json`. After those, the typed layer over the byte readings.

## Housekeeping

Every worktree under `worktrees/botassembly-*` is registered and stays. The record branches `record/0293` through `record/0297` were merged and deleted on origin. Gate tools in a fresh worktree need `sh sdlc/scripts/install` before lint.
