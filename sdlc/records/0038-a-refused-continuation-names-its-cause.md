---
base: 407b1ee1aa458a1785da9b3b2d1b26a728cd9afb
head: 237a803a92b60d324a05dcf4039db4f0d266070c
---

Landed actionable `--continue` refusals for missing, live, unreadable, changed-assembly, ambiguous, and changed-request donors. Each tells the caller the relevant next action while preserving the existing refusal vocabulary and two-line shape.

End-to-end coverage exercises successful carry-forward and each refusal path. The final verification also ran the complete offline gate.
