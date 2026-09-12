---
flow: build
priority: 6
---
Every stage — agent, gate, and hook alike — should be able to name
the run it belongs to. Export the run's id (the run directory's
basename, e.g. `2026-08-07T17-40-18-ca4f`) into the environment of
every process the run spawns, as `BOT_RUN_ID`.

Why: work a run produces (commits, records, filed issues) wants to
cite the run that produced it, so tooling can walk from an artifact
back to the run directory, its record, and its sessions. Today the
run id exists only in the runs directory listing; nothing inside the
run can see it.

Scope: the specification first — the environment a run provides to
its children is specified behavior, so the spec names `BOT_RUN_ID`
before the runtime sets it. The specification is the law here. Keep
it to the one variable; do not export the run directory path or
anything else.
