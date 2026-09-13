---
base: 2e7a52e58d1a1b25831bc64efcc99df0cababdea
head: 576de349a0600bfb82aba5421986048211b31048
---

Rejected pool workers previously escaped before the pool could stop dispatching
or retain their error. The pool now keeps rejections and settled outcomes, and
PARALLEL records a rejected branch as a fault before rethrowing. Regression
coverage and the source ratchet accompany the repair, and issue 0062 is
removed.
