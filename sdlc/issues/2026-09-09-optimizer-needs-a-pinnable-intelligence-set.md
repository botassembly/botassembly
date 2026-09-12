# An optimizer cannot pin the intelligence bundles it tuned against

Raised by the optimizer design work on 2026-08-25 and filed here on 2026-09-09. No code change is requested yet. This records two additive specification candidates and the reason neither is urgent.

## The situation

An optimization result is only meaningful under the model bundles it was measured against. Ticket 0123 gave a home a flat `intelligences` table where a name resolves one complete provider, model, and reasoning bundle. Ticket 0128 removed profiles, tiers, and literal model naming. Its stated virtue is that swapping what a name points at is one edit in one file.

That edit silently invalidates an optimization tuned against the old bundle. The table is read fresh at each run start, it lives in a home that is not an assembly and is typically not under the assembly's version control, and it has no name, no version, and no date.

Detection is already possible. The record and `bot check --json` seal the intelligence name, the rung that named it, and the resolved provider, model, and reasoning. An outside tool can therefore fingerprint bundles itself.

## What was decided outside this repository

The optimizer keeps the pinning on its own side. Each candidate ships a manifest naming, per stage, the intelligence the stage resolved and a hash of the canonical bundle that name held when the search ran, plus the base assembly's tree hash. Before a measurement, the tool resolves today's bundles and compares. A mismatch marks the result stale, reports it, and never re-anchors silently.

Three alternatives were rejected. A separate `intelligences.yaml` in the home is just as mutable and just as anonymous as a key in `config.yaml`; location was never the problem, identity over time was. Content-addressed or versioned bundle definitions in the home contradict 0128's one flat table and one edit to swap a model. A declared ordering or rank on a row is an unmeasured claim; the honest ordering is the one a measurement produces.

## Two additive candidates for this specification

1. **A canonical digest per intelligence row.** `bot config --json`, or a sibling reading, emits a stable digest for each row so external tools fingerprint bundles identically instead of each reimplementing canonicalization. Small and additive.

2. **An assembly declares the intelligence names it expects.** An assembly carrying an optimization could say which names it speaks and fail fast on a home missing a row. Ticket 0123's boundary refused this as speculation until a consumer exists. Verify before writing anything: 0123 already validates every reachable name before `run_start`, so this may add little.

Neither is urgent. 0123's boundary set the condition explicitly, and the consumer does not exist yet. Optimizer has no repository and no code.

## Sources

The full reconciliation, with the mapping table from the old profile and tier vocabulary onto intelligences, is archived at `archive/notes-2026-09-09/final-snapshot/botassembly/optimization/intelligences-reconciliation.md`. The design that consumes it is `sdlc/planning/optimize-design.md`.

## Disposition (2026-09-12)

Status: retained later opportunity. The optimizer owns bundle pinning and no
optimizer repository or caller exists in this project. Review when an optimizer
consumer exists, or on 2026-12-12 if that condition remains absent.
