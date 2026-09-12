---
flow: quickfix
priority: 4
---
# The `check --json` contract is specification, not CLI description

`bot check --json`'s output contract — the object shape, the eight
`from` rung words, the container and sentinel emission rules, the
assembly-agent form — lives in `specification/elements/inspection.md`
and, on the site, in the Runtime Reference. But the conformance
corpus asserts on that exact output for every one of its cases: a
second runtime cannot pass conformance without reproducing it. A
contract the corpus enforces is specification, wherever its prose
happens to sit. Found during the 2026-08-20 consolidation
(`sdlc/planning/spec-consolidation-report-2026-08-20.md`).

Done, observably: the `check --json` output contract moves (or is
mirrored with a single source) into the specification proper —
likely beside the conformance element, which is the thing that
enforces it — leaving `inspection.md` describing the command that
emits it and linking the contract rather than restating it. No
behavior changes; the conformance harness passes untouched.

Budget: 0 net src lines — prose reorganization.
