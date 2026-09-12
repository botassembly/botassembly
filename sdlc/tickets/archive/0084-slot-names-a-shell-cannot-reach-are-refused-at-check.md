---
flow: build
priority: 3
---
# Slot names a shell cannot reach are refused at check

Declared slot names are accepted that no author can use or tell
apart (`bot/src/flow.ts:89`): two names differing only in case
collide case-insensitively and the last silently wins, and a
hyphenated name renders as `$MY-SLOT`, which no shell expands —
the slot exists and its own gate and hook scripts cannot reach it.

Done, observably: `bot check` refuses an assembly declaring two
slots whose names collide case-insensitively, naming both, and
refuses a slot name that cannot be a shell variable, naming the
character; today's legal names run unchanged; the specification's
slots element states the name rule and the corpus pins the
refusals.

This ticket exists because of the 2026-08-19 review; it carries
the finding.

Named for restatement in `design:`/`design-review:` commits: none
expected — declared-slot tests may grow the new refusals beside
their existing cases.
