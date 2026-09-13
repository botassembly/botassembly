---
flow: build
priority: 6
---
# The record names the runtime that ran it

A sealed run captures the exact assembly it executed, but nothing
records which bot executed it. The trials project (2026-08-12)
carries this in an external preparation manifest today: the
staging-fork incident — batch work run from a prototype worktree
at a pinned commit with a private provider hack — was only
reconstructable because they wrote it down themselves.

Every run's record should state, at run start:

- the bot commit or release artifact digest that executed it;
- the dependency-lock digest;
- the runtime (node) version;
- the provider adapter identity in use.

The assembly hash is already sealed and is out of scope. Cost
accounting and per-attempt provider detail belong to 0024's
record work, not here.

## What done looks like

A run-start event carries the four facts above. A test proves the
recorded commit matches the executing checkout and that a changed
lockfile changes the recorded digest. When the runtime is not a
git checkout (an installed release), the artifact digest stands in
for the commit and the record says which kind it is.

## Design addendum, 2026-08-12 (architect)

The first flight's design review named three unanswered contracts.
Ruled here so the next design starts settled:

1. **Subflow child records.** `subflow-runtime.ts` constructs its
   own `run_start` via `runStartEvent`. Every `run_start`, top
   level or subflow child, carries the same four facts; within one
   process they are resolved once and reused, never recomputed per
   child.
2. **Release mode is out of scope.** The paragraph above about
   installed releases over-promised: no installed-release
   distribution exists today, and no artifact-digest contract will
   be invented for one. When the executing bot is a git checkout,
   record the commit with `runtime_source: "checkout"`. When it is
   not, record `runtime_source: "unknown"` with a null digest —
   honestly unknown beats a speculative contract. The earlier
   "artifact digest stands in" sentence is withdrawn.
3. **Adapter identity** means the actually resolved
   `node_modules/@earendil-works/pi-ai/package.json` name and
   version, resolved from the executing module's location, never
   the caller's working directory.

The refused attempt's branch holds a genuinely red authored test
the review judged sound — continue from it.
