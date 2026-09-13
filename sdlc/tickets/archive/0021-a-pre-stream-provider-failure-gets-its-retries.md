---
flow: build
priority: 9
deps: [0020]
---
# A pre-stream provider failure gets its retries

Follows ticket 0020, which built the wrapper seam. This ticket is
the fix for the observed production failure: three multi-stage runs
on 2026-08-11 died at a stage boundary because a retryable provider
overload arrived over WebSocket, where the pinned adapter throws
instead of retrying, so the configured `maxRetries: 1` never
applied.

## Behavior

At the wrapper, a provider failure that is retryable by the same
classification the adapter's SSE path already uses — the 429/5xx
statuses and the overloaded error text — and that arrives *before
any stream output*, consumes the configured retries before the
stage faults, regardless of transport. Whether the retry reuses the
same transport or falls back to SSE is the design's choice; what is
not a choice:

- nothing is ever retried after stream output has begun. The
  pinned adapter already draws this exact line for us: its
  `provider_transport_failure` diagnostic carries `phase`, either
  `before_message_stream_start` or `after_message_stream_start`,
  and `eventsEmitted` beside it. Prefer that published fact over
  inferring the boundary from what the wrapper happened to see;
- authentication and quota failures are never retried;
- attempts and delays appear in the record through 0020's events.
  0020's refusal addendum struck attempt numbering and delay for
  pi's retries *inside* one `stream()` call, which are invisible
  below the wrapper. This ticket's retries are the wrapper's own —
  it decides them, so it can count and time them. Adding those
  fields is this ticket's work, not a gap in 0020;
- the configured retry bound is honored exactly — no hidden extra
  attempts.

A test reproduces the observed shape: a first-request failure on a
fresh connection with a retryable classification, followed by a
success, completes the stage with the retry visible in the record;
the same failure with a non-retryable classification faults
immediately, exactly as today.

When pi itself ships a fix, this wrapper's policy becomes
redundant by construction — the retry happens below us and the
wrapper observes one clean attempt. The design should note how we
would detect that and retire the policy (a pin bump and a test
flip), so the wrapper never fights the adapter.

The src line ceiling may rise by at most 25 lines.

## Correction, 2026-08-11 (before first flight)

An external review traced the failure through the vendored adapter
and through bot. Three of this ticket's stated facts are wrong, and
one of them would send the design down a dead end. Read this
section as replacing them.

**It is not a transport problem.** The body above blames the
WebSocket path for throwing where SSE would retry. It does not. The
backend *accepted* every failing request — each failed turn carries
a `responseId`, and in one case a `thinking` block had already
begun — and then sent an in-band `error` event. In
`openai-codex-responses.js`, `mapCodexEvents` turns that event into
a `CodexApiError`, and line 233 classifies `CodexApiError` as a
non-transport error: it is rethrown immediately, skipping the SSE
fallback, the WebSocket retry, and the diagnostic. An error arriving
on an already-accepted stream is retried on **neither** transport.
So "retry regardless of transport" is still the right instruction,
but transport is not the variable and the design should not spend
effort on it.

**There is no configured retry budget being ignored.** The body says
`maxRetries: 1` never applied. In fact the adapter's retry loop
wraps only the HTTP fetch and status handling on the SSE path;
`maxRetries` defaults to 0 and bot never sets it. Separately, the
`retries: 2` visible in a stage's options is `gating.ts`'s count of
**check-failure send-backs** — it has never had anything to do with
provider errors. There is no budget to honor. This ticket is
creating the first one, and should say so.

**The `phase` diagnostic is not available for this failure.** The
body tells the design to prefer the adapter's published
`provider_transport_failure` diagnostic, with its
`before_message_stream_start` / `after_message_stream_start` field,
over inferring the boundary. That diagnostic is never emitted for
these failures — the review found none in any session record,
because the error is in-band rather than a transport failure. The
design must establish the boundary some other way and should say
which way it chose.

**Consequence for the retry rule.** "Nothing is retried after
stream output has begun" now needs a definition the design can
actually implement. Note that a failed turn produced no tool call
and no committed work, and that token accounting showed zero
consumed even where a thinking block had started — so the safe line
is probably "no tool has been executed in this turn" rather than
"no bytes have arrived". The design should choose and defend one,
not assume the old wording still points at something real.

The retry itself belongs in bot, not in a wrapper around a pi-ai
behavior that does not exist: `turns.ts` maps `stopReason: "error"`
to a fault with no loop, and that is the place with the facts.
