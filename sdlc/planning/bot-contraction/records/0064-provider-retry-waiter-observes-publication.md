---
flow: build
priority: 10
completed: 2026-09-08
---
# The provider retry waiter observes publication

## Result

The provider-retry test helper now waits for the requested `provider_retry` record under a two-second real-time deadline. It observes the record after publication instead of assuming that 100 event-loop turns are enough. A missing retry reports the requested attempt, the absence of retry events, and the last observed record event.

A test-only fixture delays retry-record publication by 1,000 event-loop turns. The existing retry tests still prove attempts `[1, 2]`, one stable nonempty provider session identity, one `mark` tool call, and the stage identity sequence across a send-back. Token-spending failures still make no retry. Exhausted retries still preserve their fault.

The fixture changes only temporary test state. Runtime retry policy, retry limits, retry delays, record shape, provider behavior, and existing behavioral assertions remain unchanged.

## Finding and boundary

Draft 0181 identified a fixed `setImmediate` loop in `bot/tests/provider-retry.test.ts`. A delayed publication could outlast that loop even while the runtime continued making progress. The implementation changes test synchronization only. Production source has zero line changes.

## Review and checks

Commit `2ee5e123` preserves the red proof. The focused provider-retry run reported 16 passing tests and two failures. The delayed-publication test reported `provider retry 1 was never scheduled`. The missing-retry assertion received the old message without the requested observed state. The failed delayed test also left its runtime promise active, so Vitest reported a follow-on `AgentHarnessError: Record writer is closed` cleanup artifact.

Independent Sol review accepted ticket 0064 without findings.

Commit `386b9141` implements the bounded publication waiter and useful missing-attempt diagnostic. The focused provider-retry suite passed all 18 tests. ESLint and all 29 custom lint-rule cases passed. `git diff --check` passed. The full root check passed 19 project tests, 210 test files with 1,445 tests, and all 143 conformance cases. Line coverage remained 97.06%. The source ratchet remains 16,022 of 16,022 nonblank production lines.

No live-provider test ran.

## Size decision

- Starting commit: `46eec9a7`, the current main baseline after manual ticket 0063
- Starting production size: 16022 nonblank lines
- Ending production size: 16022 nonblank lines
- Net increase: 0 nonblank lines
- Simpler approach: retain `setImmediate` polling and increase its turn count.
- Reason: a turn count still guesses at scheduler progress. A real-time deadline bounds the wait while repeated record reads observe publication.
- Accepted cost: one small test-only waiter and one deterministic delayed-publication fixture.

## Source

This manual ticket consumes draft 0181. Draft 0203 is next under Sol Medium. The hostile-gating abort issue and the offline-reliability ideal gap remain open.
