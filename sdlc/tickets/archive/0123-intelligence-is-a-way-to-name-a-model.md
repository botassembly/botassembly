---
flow: build
priority: 8
---
# Intelligence is a way to name a model

Today the model choice has two spellings — a literal `model` (with optional `provider` and `reasoning`) at any rung, or a `profile` plus `tier` the home's table maps. There is to be one way, and the one way is a named **intelligence**: the home's `config.yaml` holds a flat table of names, each mapping to a complete bundle — provider, model, reasoning — and everything above the home speaks only the name (Ian's ruling, 2026-08-22).

This ticket adds that way. It removes nothing. The old spellings keep working exactly as they do today, and 0128 removes them once every consumer has moved.

That order is not a preference. The bot runs from a checkout and the assembly is a symlink into another one, so a landing that added the new spelling and removed the old in one step would leave the deployed bot refusing the deployed assembly and the live home config — stopping every channel, including the one that would land the fix. The workspace already has the rule this follows: expand, migrate, contract, each landing separately, main green and deployable between them; nothing renames in place, ever.

## What done looks like, observably

- `config.yaml` accepts `intelligences`, a flat one-level table: each entry is a name mapping to a bundle where `model` and `reasoning` are required (`key-missing`), `provider` optional, any other key refused (`key-unknown`). `provider` stays optional because its omission has working semantics, kept from today: the runtime resolves the model against its configured providers, and a model offered by more than one refuses naming the candidates rather than picking (`model-unresolved`).
- The existing `profiles` table and the loose top-level `provider`, `model`, and `reasoning` keys stay valid and behave exactly as they do now. A config may carry both tables; they are separate keys and do not interact.
- Every rung — command line, task file, stage, container, flow, assembly — may name an `intelligence`. On the command line that is `--intelligence`. The nearest rung that names one supplies the bundle whole.
- **The new lookup engages only when some rung names an intelligence.** A run where no rung does resolves exactly as it does today, by the same code path and to the same values. This is the guarantee that makes the overlap safe, and it is worth proving directly rather than inferring from the cases below.
- A rung that names an `intelligence` **and** any of `model`, `provider`, `reasoning`, `profile`, or `tier` is refused, naming both keys and the rung. During a migration a file carrying both spellings is a mistake an author should see, not a precedence rule to resolve quietly — and a refusal costs nothing to delete when the old keys go. Design picks the code, reusing an existing one if it fits.
- One refusal shape for the one lookup, `intelligence-unresolved`: a name the table does not hold, refused naming the missing row — the refusal is the setup instruction. Bundle faults keep `key-missing`, `key-unknown`, and `value-invalid`.
- Every intelligence name the run's resolved rungs speak is checked against the table at validation, before `run_start`. A ten-stage flow whose last stage names a missing row refuses before the first stage runs a model.
- The home's table is read once, when the run starts; edits to `config.yaml` affect only runs that start afterward. An experiment scoped to one invocation is a throwaway `--home`, never an edit to a shared home's live table.

## Provenance and the reading surfaces

- `bot check --json`'s `options` block carries `intelligence` beside the resolved `model`, `provider`, and `reasoning`, and the rung it was named at — so what ran does not depend on what the table says later. It is absent when no rung named one.
- `bot config` prints the intelligences table and its `--json` object carries it, beside the profiles block rather than replacing it. The exact line format is design's.
- The intelligence name joins the facts an agent is never told (invariants.md's not-told list: provider, model, reasoning, timeout, retries), and the invariant witnesses that screen live prompts for those words screen for it too.

## Documentation

The specification gains the intelligences table, the `intelligence` key at every rung, and the refusals above, described as the way to name a model. The old spellings stay documented as they are, marked as superseded and scheduled for removal in 0128. No wider formatting sweep rides along, and everything this ticket writes is block style — no inline `{ }` mappings, which are JSON syntax embedded in YAML.

The canonical example is three levels named `default`, `smart`, and `quick`, each its own model and its own reasoning (Ian's ruling, 2026-08-23 — not a suggestion for design to revisit):

```yaml
intelligences:
  default:
    provider: anthropic
    model: claude-opus-5
    reasoning: medium
  smart:
    provider: anthropic
    model: claude-fable-5
    reasoning: xhigh
  quick:
    provider: anthropic
    model: claude-sonnet-5
    reasoning: low
```

## Conformance

New cases cover what this ticket adds: resolution from each rung, the nearest-rung rule, an unknown name, bundle faults, a rung naming both spellings, and a run naming no intelligence resolving unchanged. The existing corpus is untouched — every case in it names a model the old way, and every one of them must still pass byte for byte. That is the expand step's whole proof, and a case that needed editing to keep passing would mean this ticket removed something. Design finds the full case set rather than treating this list as it.

## Boundary

- Nothing is removed. `model`, `provider`, `reasoning`, `profile`, `tier`, their long options, and the `profiles` table all keep working. Their removal, the docs rewrite that follows it, and the completeness greps that prove it are 0128.
- The reserved `default` row belongs to 0128 as well. It means "what a run uses when no rung named an intelligence", and while the old spellings still answer that question it has nothing to do. Deliberately deferred, not overlooked.
- This repo's smoke ladder pins literal models in its ten `smoke/*/assembly` files and stays as it is; it converts in 0128, in the same repo and the same landing, so no gap opens.
- The record's turn events are untouched: they carry the resolved provider, model, and reasoning and never carried profile or tier names (verified by grep, 2026-08-22).
- Credentials stay where they are; the table names models, never secrets. No configuration is added beyond the table — per-intelligence timeouts, pricing, fallback chains, and an assembly declaring which names it expects are all refused as speculation until a consumer exists.

## Consumers

The sdlc repo's assembly and the live home's `config.yaml` are the consumers, and neither moves in this ticket. sdlc 0148 converts the assembly and is held until this lands, deploys, and the live home config carries the table. Botassembly 0128 removes the old spellings and waits on sdlc 0148.
