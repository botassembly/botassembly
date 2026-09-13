---
flow: build
priority: 5
waits-on: ["botassembly/sdlc/0148", "botassembly/botassembly/0141"]
---
# Intelligence is the only way to name a model

0123 added the named **intelligence** and left every older spelling working. sdlc 0148 moved the one registered assembly onto it and the live home config gained the table. Every consumer of the old vocabulary has moved, so the old vocabulary comes off — the contract step of expand, migrate, contract.

Why it has to come off rather than sit there: two spellings means every reader and every author carries both, the specification spends real words arbitrating between them, and the escape hatch generalizes — whoever may override just the model will next want the provider and the thinking level too (Ian's ruling, 2026-08-22). There is to be one way.

## What done looks like, observably

- The `model`, `provider`, `reasoning`, `profile`, and `tier` keys and their long options are gone from every authored rung — command line, task file, stage, container, flow, assembly — and from the CLI. No literal model can be named anywhere but the home's table. They survive only as bundle keys inside an `intelligences` row.
- `config.yaml`'s `profiles` table and its loose top-level `provider`, `model`, and `reasoning` keys are gone, refused as unknown keys.
- The two-axis profile-and-tier scheme goes with them. Effort variants are just names — `coder-quick` and `coder-hard` are two rows, not one row with tiers — so there is one lookup and one refusal shape.
- One name in the table is reserved: `default`. A run where no rung named an intelligence uses it. The requirement is lazy, matching the home's empty-rung principle: nothing complains until a run needs what only the table could supply. A missing table, or a missing home, behaves as a table with no rows. There is no separate pointer key. An assembly writing `intelligence: default` explicitly is legal and ordinary — it names a row like any other.
- `reasoning` is required in a bundle, and the built-in `reasoning` default dies here: with the rungs gone the bundle is the only authored place it can come from, and an omitted value falling to a hidden built-in would be a second spelling of `medium`.
- The refusal for exactly the removed keys names the successor. Refusing `model:` or `profiles:` as a bare unknown key tells an upgrading operator nothing, so those refusal sentences point at the `intelligences` table and `--intelligence`. Message text, not new codes.
- Of today's `model-unresolved` sub-cases, only provider ambiguity survives under that name; the rest die with the spellings that caused them.
- 0123's refusal for a rung naming both spellings goes too — with one spelling left there is nothing to conflict with.
- `bot config` and `bot check --json` stop reporting the profiles block wherever it is spec'd (inspection.md and the models reference page); the intelligences table stands alone.

## The sweep is complete, mechanically

The change lands in every layer — the specification's prose (home.md, invocation.md, refusals.md, inspection.md, conformance.md, invariants.md and its witnesses, and any other element that speaks of models), the runtime and its tests behind the observable outcomes above, the conformance corpus, the smoke ladder, and the docs. Completeness is checked, not remembered, and each half gets the check that can actually hold it:

- `profile` and `tier` appear nowhere in `specification/` outside three deliberate survivors — the changelog's record of their removal, the refusal sentences that name the removed keys as predecessors (required above), and the corpus case names those refusals keep — and that grep, with exactly those carve-outs, is a test.
- `model`, `provider`, and `reasoning` survive everywhere as bundle keys and resolved values, so no grep can tell a bundle-level `model:` from a rung-level one. Their mechanical proof is behavioral, and this ticket already requires it: the schema refuses them as unknown keys at every rung, and the corpus proves it case by case — a check on behavior, which is stronger than a check on wording.

## What this replaces

Nearly every conformance case carries `model:` frontmatter as scaffolding and every accept expectation prints the options block, so this ticket rewrites assertions across the corpus: each case that names a model gains a minimal home table and `intelligence:` frontmatter, and every byte-exact `expected.jsonl` regenerates under the restated options contract. The sixteen refuse cases named for model, profile, and tier are redesigned to the new vocabulary. This is meant — the old spelling is the thing being removed, and a case still asserting it would be asserting the behavior this ticket deletes. New cases cover each refusal introduced here, with design finding the full set.

This repo's smoke ladder pins literal models in all ten `smoke/*/assembly` files, per smoke/README.md's "cheapest honest settings" convention. The ladder's rows are declared in the smoke home it already sets up, and the README moves with it. It is in this repo and this landing, so no gap opens.

Hand-authored docs pages that teach the old vocabulary (reference/models.md, reference/invocation.md, the authoring guide, principles, index) are rewritten in intelligence terms, and 0123's "superseded, scheduled for removal" notes go with the keys they described. The generated spec pages follow the spec via 0121's pipeline.

## Resume across the boundary

A run faulted before this lands cannot resume after it — the converted assembly fails resume's changed-assembly check, an unconverted one refuses its keys. Accepted: those runs re-run fresh, and a refusal holds the ticket as always.

## Why one way, concretely

- An assembly that says `intelligence: coder-hard` runs on any machine whose home defines that row; an assembly that names a literal model breaks wherever that provider is absent. Names-only makes every assembly portable by construction.
- Swapping what a name points at is one edit in one file, and the evidence to operate that dial is the token-attribution reading (0122) — the loop only closes if the choice lives in one place.
- The command line keeps no literal escape hatch on purpose: a one-off experiment is one row in a throwaway home's table, which is the same one edit and leaves the same one trail.

## Boundary

The record's turn events are untouched. Credentials stay where they are. No configuration is added beyond what 0123 established. If implementation finds the record's per-stage options block stamps `profile`/`tier` beside values the way check output does, that removal is non-additive and takes 0120's generation path — verified during the work, not assumed either way here.
