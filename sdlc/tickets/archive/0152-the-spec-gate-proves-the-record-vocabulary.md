---
flow: build
priority: 7
opens: sdlc/scripts/spec
---
# The spec gate proves the record vocabulary

The spec gate fires only when `specification/` changes, so code can extend the record contract silently — and it already has. Ticket 0132 added a `prompt` field to the `stage_start` and `hook` record events plus a public `promptConstruction` reader (`bot/src/public-inspection.ts:4` at 3cb718b), and touched `specification/` zero times: `specification/elements/record.md:80-86` enumerates the other `stage_start` fields and says nothing about `prompt`, a grep across `specification/` finds nothing, and no CHANGELOG entry names 0132. The record is the product's sealed contract; this is a contract change the spec does not know about.

The enforcement should be mechanical, in both directions: derive the truth from the code and refuse when the spec lacks it.

## Done, observably

- A spec check derives the record event vocabulary — event names, and their top-level field names — from the `RecordEvent` constructors in `bot/src/record-events.ts`, and refuses when one is absent from `specification/elements/record.md`. It runs on every gate pass, not only when `specification/` changed.
- The current tree passes that check, which means the work documents the `prompt` field on `stage_start` and `hook`, the `promptConstruction` reader, and anything else the derivation surfaces, with the CHANGELOG entries the spec discipline requires.
- Deleting a field's spec sentence, or adding a constructor field without a spec edit, turns the gate red; a test proves it.

## Boundary

The check reads names, not prose quality — it proves presence, and humans still own meaning. Event shapes and code behavior do not change. If the derivation finds drift beyond 0132's, document it rather than silently narrowing the check.
