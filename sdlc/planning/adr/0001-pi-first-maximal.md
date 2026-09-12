# ADR 0001 — Pi-first, maximal

**Status:** accepted (Ian, 2026-07-31), qualified 2026-09-06 · **Date:** 2026-07-31

## Decision

The runtime never duplicates anything Pi owns: model sessions, the tool loop,
providers, transport retries, truncated-turn handling, token/cost accounting,
session persistence. Behavior that crosses stages — gating, control tools,
record tapping — is written as a Pi extension hanging on public SDK surface,
not as an orchestration layer beside Pi. The runtime proper is a folder
reader/validator, a graph walker, a child-process runner, and a JSONL writer.

## Context

The predecessor (~62k lines) grew a bespoke layer that re-implemented Pi
behavior it already had: a second transcript format (its own ticket 260 calls
it "the single largest source of complexity" in resume), hand-rolled usage
roll-up, an external output-token meter, a later-deleted whole-run retry layer
(its ADR 0054). Every duplication was paid for twice — once to write, once to
keep in step with Pi. This ADR absorbs and supersedes the staging note at
`design/pi-first-policy.md`.

## Consequences

- A proposed runtime feature first asks "can Pi already do this, or can a
  ~200-line extension on Pi's public API do it?" Only a no to both admits
  bespoke code.
- Capabilities Pi lacks are filed upstream (ADR 0011) and glued minimally in
  the meantime, with the glue marked for deletion.
- The runtime records what Pi surfaces; it never re-derives, re-prices, or
  re-classifies what Pi has already said.

## Current qualification — 2026-09-06

Pinned Pi 0.83.0 exports a retry helper, policy, callbacks, and the transient-error classifier. Two observable Bot behaviors still require local code. Bot retries only failures that report zero usage, and Bot publishes stream events only from the selected attempt. The helper's message interface creates an adaptation cost at Bot's event-stream boundary. The helper also uses the global timer and returns a different message when backoff is aborted. Current evidence does not show that either implementation difference matters to a user. A replacement does not need to preserve Bot's clock mechanism or abort-message shape unless later integration evidence makes one observable. Bot therefore keeps one bounded 68-nonblank-line adapter in `bot/src/credentials.ts` until a focused replacement design proves net deletion while preserving the two required observable behaviors. This section qualifies the absolute transport-retry sentence in the original decision. [The current qualification](../bot-contraction/pi-boundary-qualification.md) records the repeatable pinned-helper comparison, the failed 0.85.1 spike, the deletion and compatibility evidence required by ADRs 0003 and 0021, and the accepted cost.
