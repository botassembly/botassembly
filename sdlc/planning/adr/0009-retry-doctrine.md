# ADR 0009 — Retry doctrine

**Status:** accepted (Ian, 2026-07-31), qualified 2026-09-06 · **Date:** 2026-07-31

## Decision

Pi's in-turn transport retry is always enabled (`maxRetries` on stream
options); the runtime builds no retry machinery of its own, at any layer
(spec: runtime.md, "no retry machinery"). When a provider failure survives
Pi's handling, the runtime **does not classify it at all — it records it**:
the stage fails with cause `fault`, exit 2, and the record carries the
provider's words. (Pi's error classifier is not exported today — upstream
ask #2, ADR 0011. If and when it lands, the doctrine extends to: trust its
*positive* never-retry signals, never trust its silence — an unclassified
error is unknown, and unknown is not a verdict on the agent. That sentence is
a future state, not a present decision; review caught the earlier wording
pretending otherwise.)

## Context

Carried verbatim from the predecessor's 483-run failure corpus
(`bot/planning/investigations/2026-07-16-run-failures.md`): it had disabled
Pi's in-turn retry, then treated Pi's retryability classifier — which returns
false on anything it does not recognize — as a veto; nine runs died on a
transient `model_not_supported` 400 that succeeded minutes later. The
surviving doctrine: "silence means unknown, unknown means one more try" — and
the *one more try* belongs to Pi's transport layer, configured, not to code we
write. Getting the classifier exported publicly is upstream ask #2
(ADR 0011); until then the runtime does not classify at all, it only records.

## Validation

Unverified assumption, named honestly (evidence audit): no prototype forced a
transport failure, so `maxRetries` on 0.83.0 has been read in the typings but
never watched working. Forcing a real provider retry deterministically is not
worth a prototype; the accepted evidence is Pi's own surface plus the
predecessor's corpus showing what disabling it cost. If P5's live scenarios
happen to hit one, the record's `turn` lines are where it would show.

## Consequences

- No whole-run relaunch, no middle retry layer, ever — the predecessor built
  one and then deleted it (its ADR 0054).
- `retries` in the spec is about gating send-backs and nothing else; the two
  vocabularies never mix.

## Current qualification — 2026-09-06

Pi 0.83.0 already exports `RetryPolicy`, `retryAssistantCall`, `RetryCallbacks`, and `isRetryableAssistantError`. The helper implements transient classification, a retry ceiling, exponential delays, abort handling, and retry callbacks. Two observable Bot behaviors remain outside it. Bot's zero-usage fence stops a retry after any reported usage. Bot also publishes stream events only from the selected attempt. The helper accepts and returns one `AssistantMessage`, so adapting it to Bot's `AssistantMessageEventStream` costs local code. Two other differences have no proved product significance. The helper uses the global timer instead of Bot's injected clock, and a backoff abort returns an `aborted` message without the provider error. A replacement need not preserve those mechanisms or that message shape unless later integration evidence makes them observable. Bot therefore owns a bounded adapter in `bot/src/credentials.ts` until a focused replacement design proves net deletion while preserving the two required observable behaviors. This section supersedes the original present-tense no-machinery statement, classifier-export statement, and unverified-assumption paragraph. They remain as historical context. This is an explicit temporary exception. Bot keeps no whole-run retry layer. A direct change to Pi 0.85.1 also fails with 94 TypeScript errors across the harness boundary. [The qualification record](../bot-contraction/pi-boundary-qualification.md) records the evidence and the adapter boundary.
