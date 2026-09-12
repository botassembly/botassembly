---
flow: build
priority: 7
deps: ["0019"]
---
# The record names each stage's resolved slots

Ticket 0019 puts the stage workdir in the record; this ticket
depends on it and extends the same event. The trials
project's audit work (2026-08-12) needs the rest of the minted
slots too: at every stage start — including each retry — the
record should carry the resolved paths for pwd, input, output,
tmp, and skills, copied from the stage's runtime context at the
moment they are minted, never reconstructed from cache
conventions.

This lets a post-run audit distinguish a correct `$TMP/file` from
a hard-coded `/tmp/file`, the current `$OUTPUT` from another
stage's, and a slot path from a role-parent or sibling path. It is
observability, not sandboxing: record what was minted, refuse
nothing.

Motivating failure: a consumer's curator run
(`runs/2026-08-12T19-05-52-a174`) wrote
`/tmp/curation.json` instead of using `$TMP`; proving that from
the record alone required reconstructing paths by convention.

## What done looks like

Each stage-start event in the run record includes the five
resolved slot paths as absolute paths taken from the same values
the stage's environment received. Existing 0019 workdir assertions
keep exact strength; a test proves the recorded paths equal the
env the stage saw, including on a gate-retry restart.
