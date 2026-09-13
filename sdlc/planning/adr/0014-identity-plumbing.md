# ADR 0014 — Identity plumbing under concurrency

**Status:** accepted (Ian, 2026-07-31) · **Date:** 2026-07-31

## Decision

Every record event is stamped `{stage, repeat, retry}` by **explicit
per-harness context**: when the stage executor constructs a harness, it also
constructs that stage's tap — a closure holding the identity and the record
writer — and subscribes it to that harness alone. No module-level "current
stage," no AsyncLocalStorage, no ambient anything.

The record writer is one append queue per record file: writes are serialized
so JSONL lines never interleave, and the queue is handed to taps, never
reached for globally. A child run's tap gets the child's writer; the parent's
`subflow_call` event is written by the parent's tap. The two never share
state beyond the file-system nesting.

## Context

Adversarial review caught ADR 0008's "stamps identity from ambient run
context" as untested under the one-process model's real concurrency:
interleaved PARALLEL branches and batched subflow children share one event
loop, and ambient state cross-stamps events exactly when the record matters
most — intermittently, invisibly in serial tests. P2/P3's dumps never ran two
sibling stages of one record concurrently. Explicit closure-per-harness is
chosen over AsyncLocalStorage because it is not cleverness: the stage
executor already holds the identity at harness construction, so passing it is
zero new machinery and the failure mode (a missing stamp) is a type error,
not a race.

## Consequences

- P5's PARALLEL scenario asserts stamp correctness under interleaving: two
  concurrent branches, every `turn`/`tool_call` line attributed to the right
  branch.
- Anything inside the runtime that wants "the current stage" must be handed
  it; wanting it ambiently is the design smell ADR 0010's rules exist to
  catch.
