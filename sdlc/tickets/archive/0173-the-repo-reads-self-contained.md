---
flow: build
priority: 2
---
# The repo reads self-contained to an outside reader

Living content cites private consumer projects by name. Trials4 appears in
sdlc/planning/lessons-from-bot.md. An outside reader cannot resolve these
names and should not need to.

Required behavior: private ecosystem names (trials4/6/7/8, and the other
names in the grep set below) leave living content — planning and docs.
Replace each name with a neutral phrase such as "an early consumer" or "a
field report from a live consumer". Keep the observation each citation
carries; drop only the private name. History stays untouched: sdlc/records/
and any archived tickets are append-only and keep their text.

Amendment (2026-08-28, after the first attempt refused): the first attempt
refused correctly because the path policy forbids this flow from committing
edits under sdlc/tickets/. The ticket-tree hits in tickets 0017, 0022,
0027, and 0035 through 0039 were cleaned by hand on 2026-08-28 and are out
of this ticket's scope. This ticket edits nothing under sdlc/tickets/.

## Done when

`git grep -niE "trials[0-9]|nucleus|genomoncology|librarian|varclassify|picohr|imaurer|rolodex" -- ':!sdlc/records' ':!sdlc/tickets'`
returns no hits.

## Boundary

No history rewrites. No code behavior changes. Renames apply only where a
name appears in prose or comments. If a name turns out to be baked into a
code identifier, path, or test assertion, stop and raise it as an open
question instead of renaming it.
