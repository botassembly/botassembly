---
flow: build
priority: 9
---
# A run's provider identity is its own

`sdlc/issues/concurrent-channels-share-one-session-id.md`: the
provider session identity is hashed from flow, stage, and repeat
without the run, so three concurrent runs of the same stage
produced identical session, request, and prompt-cache identity.
What is demonstrated is identity collision and ambiguous provider
diagnostics — cache cross-contamination is NOT demonstrated, and
this ticket makes no such claim.

## What done looks like

- Two concurrent runs with the same flow, stage, and repeat get
  different provider session and cache identities.
- Retries within one stage attempt keep the identity stable, so a
  resumed prompt still hits its own cache.
- The record joins provider attempts, model turns, stage, retry,
  and run unambiguously.
- When this lands, delete the issue file named above.

Tests cover the collision case directly: same stage identity, two
run ids, distinct session identity; and the stability case: one
stage attempt, a provider retry, one session identity.

## Refusal addendum, 2026-08-12 (architect)

The first flight was refused for modifying
`bot/tests/provider-retry.test.ts` without authorization. That
modification is in scope: the stability requirement — retries
within one stage attempt keep one session identity — lives in the
retry path, so its existing test may be restated to thread run
identity through.

Authorized exactly: `bot/tests/provider-retry.test.ts` may be
restated where session or cache identity appears in its
assertions, provided every retry-classification and
attempt-counting assertion keeps exact strength.

No other existing test may be changed. The refused attempt's
branch is prior art — continue it rather than restarting.

## Second refusal addendum, 2026-08-12 (architect)

The second attempt was refused because its test changes rode in an
ordinary `code:` commit. The rule stands: every test change —
including the restatement of `bot/tests/provider-retry.test.ts`
authorized above and the NEW `bot/tests/provider-session-identity.test.ts`
— belongs in a `design:` or `design-review:` commit. The new test
file is authorized by name here.

On the continued branch, recommit so that all test content lands
in design-stage commits and the `code:` commit carries only
non-test source. The implementation itself was not faulted; do not
redesign it — restructure the commits.
