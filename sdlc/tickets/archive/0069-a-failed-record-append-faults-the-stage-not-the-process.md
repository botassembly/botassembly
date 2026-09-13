---
flow: quickfix
priority: 7
---
# A failed record append faults the stage, not the process

`retryStream` (`bot/src/credentials.ts:248`) drives its retry loop
with `void run()`, and `run()` has no try/catch around the awaited
`writer.append`. When that append rejects — disk full,
permissions, a poisoned record tail — the rejection is unobserved:
Node kills the process, the record is left unsealed with no
`run_end`, and the output stream is never ended. Everywhere else
the same append rejection is caught into a graceful stage fault
(`bot/src/flow.ts:119-122`).

Done, observably: an append failure during a provider retry ends
the stage as a fault the way any other append failure does — the
record seals, `run_end` is written, the process survives.

This ticket exists because of
`sdlc/issues/0055-a-failed-retry-append-is-an-unhandled-rejection.md`.

Named for restatement in `design:`/`design-review:` commits: none
expected — new cases land beside the existing provider-retry and
record tests.
