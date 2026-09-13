---
flow: build
priority: 7
---
# The spec carries no retired model vocabulary

Ticket 0128 replaced profiles and per-key model choice with intelligences, and the specification is half-migrated. At d0224ce: `specification/elements/assembly.md:43` still says `model` is required while `refusals.md:58-61` says the retired keys refuse as `key-unknown` — a direct contradiction on a core key; assembly.md:34 and 48-50 and 75-76 carry the retired keys and a garbled duplicate `intelligence` row; stage.md:75-76, 98, 100-102 and flow.md:63-64 list retired `provider`, `model`, `reasoning`, `variant` as settable; example.md:43 gives a worked example (`model: claude-opus-5`) the current contract would refuse — the front-door example does not run; inspection.md:401-409 has two consecutive garbled `bot config` intelligences blocks; conformance.md:74-82 says "a intelligence" and describes retired `variant`.

The retired-vocabulary guard in `bot/tests/spec-vocabulary.test.ts` matches only `profile|tier`, so it missed `variant` and the doubled `intelligence`. The residue class must turn the gate red, or the next migration leaves the same trail.

## Done, observably

- Every file above describes only the intelligences contract, consistently with refusals.md and invocation.md; the worked example runs under `bot check`.
- The retired-vocabulary test covers the full retired key set, and seeding any retired key back into a spec element fails it.
- A CHANGELOG entry records the sweep.

## Done means the document agrees with itself

This ticket is a documentation and test-guard change. Runtime behavior does not change; the conformance corpus does not change except where a case's prose comments carry the same residue.
