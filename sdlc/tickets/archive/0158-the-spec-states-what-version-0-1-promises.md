---
flow: build
priority: 6
---
# The spec states what version 0.1 promises

The specification has no version identifier, no stability policy, and no conformance-claim policy. Ticket 0109 removed the revision number deliberately and nothing replaced it; a grep for version, stability, or provisional across README.md and conformance.md finds nothing. The record format has a written evolution policy (record.md:33-43); the document itself has none. Publishing 0.1 requires these sections to exist, and they currently have zero words.

## Done, observably

- The specification carries a publication-level version statement: the document as a whole is versioned (0.1 next), individual tickets do not bump it, and the statement says what a version change means for a conforming runtime.
- Every element chapter carries a stability level. Core chapters (graph, stage, flow, assembly, slots, home, invocation, runtime, record, refusals, invariants, the gate and hook set, the control-flow set, conformance, the example) are stable; inspection, management, and auth are provisional, and the provisional marking says what may still change. A provisional chapter must still be accurate: `bot draft` and `bot rejected` exist in code with no spec sentence, and the `runs`, `status`, and `prune` versioned JSON documents are unspecified while deck consumes them — each shipped verb gains at least its one honest sentence or the chapter's provisional note names it as unspecified.
- A conformance-levels section distinguishes corpus-passing static conformance (the 142-case suite) from self-claimed invariant compliance, and says which claims 0.1 supports.
- A compatibility sentence states what 0.1 promises on the way to 1.0.
- invariants-witnesses.md is marked non-normative repo tooling or moved out of the published set; the CHANGELOG is marked history, not contract.

## Boundary

Policy and marking only. No element's technical content changes here; the residue sweep is ticket 0157 and stays there.
