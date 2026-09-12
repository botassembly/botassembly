# Site iteration without per-change review

Decided 2026-09-11. Ian ruled that the documentation site, the examples folder, and their planning notes iterate under standing permission: the site owner merges to `main` and deploys without a per-change review, uses independent subagent reviews as the gate, and keeps going until the result is good. Runtime work under `bot/` and `specification/` stays with the runtime team and its ticket sequence.

## Boundaries

- Site changes touch `docs/`, `examples/`, `sdlc/planning/notes/`, `sdlc/issues/`, and the scripts that check those trees. Nothing under `bot/` or `specification/` changes on a site branch.
- Every merge fast-forwards `main` after a rebase, with `sdlc/scripts/lint` and the docs build green.
- Runtime defects found while iterating become issue files handed to the runtime team, never fixes on a site branch.
- Ian can end this at any time by saying so; the ruling is recorded here so a later reader knows why site commits landed without a ticket.
