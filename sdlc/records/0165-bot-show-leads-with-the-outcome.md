---
base: 842c0630cc55a2d00b977f02f3199288f03c1815
head: 74df0139f61bc39857313e4e17a0d286bbc1438e
---
# Bot show leads with the outcome

Human `bot show` readings now lead with the run result, identity, elapsed
wall time, and stage and total spend. Repeated adjacent transports collapse,
and aligned turn rows compact token magnitudes without changing record JSONL.

This keeps the answer visible before long event histories while preserving the
complete underlying event log and terminating error.
