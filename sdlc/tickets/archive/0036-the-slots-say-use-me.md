---
flow: build
priority: 6
---
# The slots say use me

A consumer project's first day: an agent wrote `/tmp/make.py` and
`/tmp/fix.py` — literal `/tmp` — because the slot line
"`$TMP` — empty scratch space for this task" describes what the
slot is and never says to use it. Working files escaped the
run's scratch lifecycle. The same gap generalizes: agents
expanded slots to resolved absolute paths and worked with
those, which is obedient shell behavior nobody instructed
otherwise.

Two instruction changes in the prompt's slot rendering, no
mechanism (bot is not a sandbox; the instruction just has to
exist — Ian's ruling 2026-08-13, after weighing and rejecting
path enforcement):

1. The `$TMP` slot line becomes "`$TMP` — empty scratch space
   for this task; write working files here and nowhere else."
2. Where the slots are introduced, one framing sentence:
   address files through the slot names, not through the paths
   they resolve to. `$PWD` stays implied as the natural base
   for relative paths; the sentence disciplines slot usage, it
   does not forbid the working directory.

Named for restatement in `design:`/`design-review:` commits:
`bot/tests/prompt.test.ts` and the golden transcripts under
`bot/tests/golden/` that carry the slot lines.
