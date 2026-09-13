---
flow: build
priority: 5
---
# One call attributes tokens to stages and models

The record already attributes every token: each `turn` event names
the stage, retry, provider, and model beside its `input`, `output`,
`cache_read`, `cache_write`, and `total` counts. But no reader
aggregates that across runs. `bot runs --json` returns one `tokens`
total per run with no model or stage breakdown, and the only way to
get one is `bot show` per run — hundreds of calls for one aggregate.

The consumer is real and waiting: the observation level's cross-run
stats (deck `stats`, per the surface map in
`repos/factory/sdlc/planning/surface-map.md`) promises token usage
by model, and the map names this reader as its wait. The map also
rules out the workaround — no stats path may sweep `show` across
every run.

## Why it matters

- Model choice is meant to be an operating decision — a named
  intelligence in the assembly, concrete models in the home's
  table (botassembly 0123). That
  dial can only be operated with evidence: what did this model cost
  in tokens, on which stages, compared to last month's. The evidence
  is in the records; only the one-call reading is missing.
- Attribution per stage is what makes the numbers actionable. "This
  run used 11M tokens" prompts nothing; "the gate retry loop in
  02-implement burned 8M of them on the expensive model" prompts a
  change.
- Every layer above (deck, any future eval work) needs this exact
  reading; providing it once in bot's readers keeps bot's CLI the
  only parser of records.

## What done looks like, observably

- A `--json` reading answers, in one invocation over the whole runs
  directory: per run, per stage (with retry), per provider and
  model — input, output, cache read, cache write, total. The shape
  is aggregated `turn` events, nothing invented.
- It lives on the existing surface per the balance test — a flag on
  `runs` (for example `bot runs --usage --json`), not a sibling
  verb — and honors the shared grammar where it applies (`--since`,
  `--limit`, `--all`, id prefixes).
- The default `runs` output is unchanged; the flag only adds.
- Reading uses the same record readers the other inspections use —
  no second parser — and a record generation this reader carries is
  read the same as a current one (0120's normalization applies
  before attribution).

## Boundary

Tokens only, no dollars: records deliberately do not price tokens
(subscription providers have no meaningful per-token price), so
pricing stays a consumer's concern, never a record claim. No change
to the record format, the runtime, or what is written — this is a
reading of what seven months of records already say.
