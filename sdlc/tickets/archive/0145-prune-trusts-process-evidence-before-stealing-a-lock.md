---
flow: build
priority: 25
deps: ["0147", "0146"]
---
# Prune trusts process evidence before stealing a lock

This absorbs `sdlc/issues/2026-08-26-prune-summary-test-flakes-under-parallel-preflight.md` only for the demonstrated destructive liveness gap. The intermittent summary timeout remains a watch item unless retained preflight evidence proves that it has another cause.

Two authorities answer "is this run alive" and they disagree. `bot busy` consults the run's recorded process-group evidence and fails safe — any doubt reads as alive. Prune's liveness check is a lock-file staleness test alone: a lock whose holder has not refreshed it for ten seconds reads as dead. A live run whose lock refresh starves past that window on a loaded box — the same starvation suspected in the 2026-08-26 preflight flake — therefore looks dead to prune while looking alive to busy, and a `prune --delete` whose selector covers the run steals the stale lock and removes a live run's directory. The destructive authority is the weaker one.

Done, observably: prune refuses to remove any run whose recorded process evidence says alive, regardless of lock staleness — the same authority and the same fail-safe direction busy already uses — and a test pins the disagreement case: lock stale, process group alive, prune declines and says why. Runs with no live evidence and a stale lock remain prunable exactly as today.
