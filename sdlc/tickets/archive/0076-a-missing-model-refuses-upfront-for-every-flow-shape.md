---
flow: quickfix
priority: 4
---
# A missing model refuses upfront for every flow shape

The upfront walk that proves every stage can resolve a model
(`bot/src/machinery.ts:68`) misses a DESCEND flow's self-child, so
an assembly whose recursive flow lacks a resolvable model passes
the upfront check and fails mid-run with "No unique model" —
after stages have already spent tokens. The whole point of the
upfront walk is that this refusal happens before any work does.

Done, observably: an assembly whose DESCEND self-call cannot
resolve a model is refused before the run starts, naming the
stage, exactly as a plain flow's missing model is today; a
resolvable DESCEND runs as before.

From the 2026-08-19 review; this ticket carries the finding.

Named for restatement in `design:`/`design-review:` commits: none
expected — new cases land beside the existing model-resolution
tests.
