---
flow: build
priority: 6
---
# The request is readable

A run's record names its request — path, hash, byte count — but
no verb emits what was actually asked. `bot output` gives the
answer side; the question side has no reader, so a consumer
(the deck's run page, found 2026-08-14 when its design refused
on exactly this) would have to reach into the run directory by
hand.

`bot request <run>` writes the run's sealed request to stdout,
byte-exact, the way `bot output` writes the answer — nothing
added, nothing rendered. Prefix resolution, exit codes, and the
two-line refusal shape follow `bot output`'s existing manners: a
run that cannot be found or whose request file is missing or
unreadable says so and exits accordingly.

Named for restatement in `design:`/`design-review:` commits:
`bot/tests/cli-help.test.ts` and `bot/tests/cli-help-facts.test.ts`
(the command list grows a line); this verb's own assertions are
new. No existing command's output changes.
