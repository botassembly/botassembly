---
flow: build
priority: 6
---
# ADR: the long-term auth story is "do what pi does, through pi"

ADR 0017 gave bot its own authentication: `bot auth login` reads a
terminal, credentials live in
`$XDG_CONFIG_HOME/bot/credentials.json`, and nothing else holds
them. That is right for one operator at one machine and this ticket
changes no behavior.

Three questions have no ruled answer, and the 2026-08-20
documentation review surfaced all three from the adopter's side:

1. **Headless.** `bot auth login` requires a terminal; a scheduler
   or script-provisioned box has no blessed path to a credential.
2. **Lifecycle.** Expiry exists (the smoke ladder preflights it) but
   rotation, re-login prompting, and a credential dying mid-run are
   behavior, not ruling.
3. **Provider onboarding.** Each new provider brings its own
   credential shape; what bot absorbs versus what it asks of the
   operator is undocumented.

The ruling direction, set 2026-08-20: **mimic what pi does, as
simply as possible, leveraging pi's code as much as we can.** bot
already pins pi's library; wherever pi has an answer — its login
flows, its credential shapes, its refresh handling, its provider
onboarding — bot's answer is the same one, reached through pi's
code rather than reimplemented. The ADR's job is to walk the three
questions against what pi actually does, adopt each answer, and
name plainly any place bot must deviate and why.

Done, observably: an accepted ADR under `sdlc/planning/adr/` ruling
the three questions on that direction, and follow-on tickets cut for
whatever behavior the ruling requires. No src budget — this ticket
writes a decision, not code.
