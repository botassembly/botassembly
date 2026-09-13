---
flow: build
priority: 10
completed: 2026-09-08
---
# A provider failure reason carries its direct cause

## Result

When the retry boundary receives an `Error` with a qualifying direct cause, Bot now reports the outer message, the cause message, and the cause code when one exists. The same bounded text reaches the assistant session, `stage_end.reason`, and `run_end.reason`. Nonqualifying causes and non-Error failures keep their existing meanings. The `provider_retry` event and all retry behavior remain unchanged.

The implementation uses the existing UTF-8-safe `boundedText` helper after composition. It does not trim, normalize, deduplicate, recurse through causes, change transport handling, or add fields to any event.

## Review

Independent Sol Medium design review rejected the source draft because it falsely said `provider_retry` had a reason and left cause qualification, malformed values, direct-only behavior, one bound, propagation surfaces, and test requirements underspecified. The accepted manual ticket names the direct-cause shape, malformed-value behavior, one bound, the session, `stage_end`, and `run_end` propagation surfaces, and the unchanged retry boundary.

Luna High implemented the accepted ticket. Independent Sol Medium code review required a full-flow proof. The remediation now uses `JsonlSessionStorage`, drives an actual rejected provider stream with a real `Error` cause, reads the persisted session, and checks both terminal events. The follow-up review accepted the remediation.

## Checks

The first focused regression was red: the provider failure reason was `fetch failed` instead of `fetch failed: unable to get local issuer certificate [UNABLE_TO_GET_ISSUER_CERT_LOCALLY]`.

The focused provider-retry suite then passed 17 tests. It covers the direct cause and code, no code, malformed cause and code values, nested causes, multibyte truncation, the non-Error fallback, existing retry behavior, the persisted raw session, `stage_end`, and `run_end`. Type checking, Bot lint, and `git diff --check` passed.

The first complete check reached the runtime suite and failed in an unrelated load-sensitive `hostile-gating.test.ts` case. Its probe did not observe the held stream before the bounded wait ended. Cleanup then reported `ENOTEMPTY`. The exact test passed immediately by itself. A second complete check passed 19 project tests, 208 runtime test files with 1,420 tests, and 143 of 143 conformance cases. Coverage reported 96.40 percent of production lines. The source ratchet passed at 15,647 of 15,647 nonblank lines. The dated issue file preserves the new sighting without claiming a production defect.

No live-provider test ran.

## Size decision

- Starting production size: 15634 nonblank lines
- Ending production size: 15647 nonblank lines
- Net increase: 13 nonblank lines
- Simpler approach tried: reuse the existing `boundedText` helper and keep one local formatter at the retry-failure boundary.
- Why insufficient alternatives were rejected: keeping only the outer message loses the provider fact that identifies the failure. Moving the behavior into generic error handling widens the change beyond the retry-failure boundary.
- Production code deleted: none.
- Reason: one local formatter validates the direct cause and code, composes the required text without normalization, and applies the existing UTF-8-safe bound once. The focused tests justify the boundary and the specification names it. Reusing `boundedText` avoids a second byte-bound implementation.
- Accepted cost: 13 production lines and a larger focused test fixture. Retry scheduling, event shape, transport, and dependencies keep their existing cost and behavior.

## Source

This manual ticket came from draft 0200. The draft is consumed by this record.
