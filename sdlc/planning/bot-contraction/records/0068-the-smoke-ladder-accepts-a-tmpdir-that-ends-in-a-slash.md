---
flow: build
priority: 5
completed: 2026-09-09
---
# The smoke ladder accepts supported temporary paths

## Result

The smoke driver now selects its root in the documented order: `SMOKE_HOME_ROOT`, then `${TMPDIR}/bot-smoke`, then `/tmp/bot-smoke`. It normalizes that root before it adds the session name. A trailing slash therefore cannot create a second spelling for the home.

Four focused tests make the environment hermetic and prove the trailing-slash path, the unset fallback, explicit-root precedence, and the strict mismatched-home refusal. The refusal leaves the mismatched home in place.

## Complexity and review

This was level 1 when implementation began because one shell expression owned the observed failure. Ticket 0221 changed the smoke inspection contract before this ticket could close, so the final rebase also had to preserve those current readers. Luna High implemented and rebased the change. Sol Medium found that the trailing-path test could inherit `SMOKE_HOME_ROOT` and therefore pass without exercising `TMPDIR`. Sol also found that precedence had no direct test. Luna cleared the ambient variable and added the missing proof. Sol accepted the revised offline implementation.

## Checks

The focused suite passed 12 tests. The complete offline check passed 42 project tests, 211 runtime test files with 1,454 tests, all 143 conformance cases, and 97.07 percent line coverage. The source ratchet remained 16,056 of 16,056.

The earlier trailing-slash live ladder passed every model rung and supplied the session that exposed ticket 0221. The final live ladder ran with both `TMPDIR` and `SMOKE_HOME_ROOT` unset. It created `/tmp/bot-smoke/2026-09-09T14-37-42-a6fc28fd`, passed all ten model rungs, reported positive token totals for every model rung, and passed all 47 S6 assertions. It completed in 198 seconds.

The primary agent moved the final S5 answer aside and replayed S6. Exactly one assertion failed: `bot run output --raw hands back bytes matching the record's sealed hash`. The agent restored the file, confirmed its original SHA-256, and replayed all 47 assertions green. The falsification ledger carries the exact evidence.

## Source

This manual ticket consumes draft 0206. Draft 0216 is next under Luna High.
