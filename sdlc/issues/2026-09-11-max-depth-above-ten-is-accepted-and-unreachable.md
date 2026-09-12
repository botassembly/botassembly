# `max-depth` above ten is accepted and can never be reached

`DESCEND.md` takes `max-depth`, "the longest unbroken chain of this flow's self-calls".
`bot check` validates it as a bounded integer with a minimum of 1 and no maximum
(`bot/src/documents.ts`, `boundedInteger(value, 1)`), so `max-depth: 99` resolves and exits 0.

The runtime has a fixed ceiling the author cannot see. `bot/src/subflow-runtime.ts` empties
the subflow scope at `callChainDepth >= 10`, and a self-call is a subflow call, so the
self-chain stops at ten however the author wrote it. The specification says the ten-call
mixed-flow ceiling "does not change the authored meaning of `max-depth`". For every authored
value above ten the authored meaning is unreachable, and nothing says so: not the check, not
the refusal text, not the record.

Two smaller things fall out of the same place.

The refusal line names no bound. `max-depth: 0` and `max-depth: two` both give
`value-invalid` with "Give max-depth a valid value." `width` in the same position gives
"Give width a value of at most 32", which tells an author what to write instead.

The ceiling appears in no repair line at all, so an author whose descent stopped four levels
short of the bound they wrote has nowhere to look but the source.

Either refuse `max-depth` above the runtime ceiling with a repair line that names it, or
document the clamp where the key is documented. Accepting a bound that is silently overridden
is the one option that teaches the author something false.

Found while writing `examples/outline`, which uses `max-depth: 3` and is unaffected.
