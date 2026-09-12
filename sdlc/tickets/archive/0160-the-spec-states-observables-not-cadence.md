---
flow: build
priority: 4
---
# The spec states observables, not cadence

Several implementation details leak into the specification as contract sentences, and each one is a churn generator: a second runtime either copies bot's internals or diverges from the letter of the spec. At d0224ce: `runtime.md:153-160` prescribes the 250 ms sampling interval for `tmp-max-bytes` (the byte ceiling is contract; the sampling cadence is bot's); `inspection.md:84-85` pins `bot busy`'s freshness to a ten-second heartbeat number; `slots.md:158-159` hardcodes the literal `$XDG_CACHE_HOME/bot/tmp/` path as if it were the contract rather than this runtime's choice.

The 2026-08-22 retry-policy ruling is the template: the spec stopped prescribing retry mechanics and stated the observables. Apply the same cut to these.

## Done, observably

- Each named passage states the observable guarantee (the ceiling is enforced; a live directory reports busy; scratch lives outside the working tree in a runtime-owned location) and moves the number or path to a clearly marked this-runtime note, or drops it.
- No behavior changes and no conformance case changes; a CHANGELOG entry records the recharacterization.

## Boundary

Only the passages named above, plus any sibling an editorial read finds in the same class. This ticket does not touch the model-vocabulary sweep (0157) or the policy sections (0158).
