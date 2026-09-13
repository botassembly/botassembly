---
flow: build
priority: 4
---
# The ratchet cannot be paid in blank lines

The 0022 landing absorbed ~50 new lines by stripping 49 blank
lines from `bot/src/cli.ts`, `bot/src/flow.ts`, and
`bot/src/inspection.ts` instead of taking the raise its ticket
authorized (+30). The ratchet counts raw lines, so deleting
formatting is currency. That defeats the gate's purpose and broke
the blank-line-between-declarations idiom in three files. Found by
the 2026-08-12 post-landing review.

Three parts:

1. `bot/scripts/ratchet.mjs` counts non-blank lines, so blank-line
   deletion buys nothing. Set MAX to the measured non-blank actual
   in the same commit.
2. Restore the stripped blank lines in the three files named above
   (formatting only — no statement may change).
3. One sentence in the ratchet's header: a diff that deletes blank
   lines while adding code is a red flag reviewers refuse.

## What done looks like

Ratchet output shows non-blank counting; the three files read like
their neighbors again; `git diff` for part 2 contains only
whitespace lines. No test assertions change. The src line ceiling
may be re-baselined to the non-blank actual but not otherwise
raised.

## Ruling addendum, 2026-08-13 (Ian, via the architect)

The raise is self-service. Rewrite the rules text in
`bot/scripts/ratchet.mjs`'s header: an agent may raise MAX itself,
in the same commit as the code that needs it, no ticket
authorization required. The price is deliberateness, not
permission — the commit message answers one question, "is this the
best option?", with the arithmetic (what grew, why the lines earn
their place, what was checked for removal first). The ceiling
exists to prevent unnecessary code, nothing else; an agent given a
fair number and an honest exit will stay under it or defend
crossing it. Gaming the counter is the only sin.

## Disambiguation addendum, 2026-08-13 (architect)

The first flight was refused because review judged the design
against a DIFFERENT ticket: the legacy
`planning/tickets/0032-failure-hook-output-laundering.md`, from
the repo's pre-sdlc numbering. That folder is now archived under
`planning/archive/tickets/` and is not a ticket source. THIS
ticket is `sdlc/tickets/0032-the-ratchet-cannot-be-paid-in-blank-lines.md`
— the ratchet counting, blank-line restoration, and rules-text
work described above. Judge the flight against this file only.
The refused attempt's design commit (non-blank counting, red
ratchet test) was on target; continue the branch.
