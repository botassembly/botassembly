---
base: 29f1e1e56aecdeb8e21e8ac684914b7cfb0660c8
head: 784d9876f7a51c2b00af4cd40dfaaa922832ce29
---

Landed compromised run-lock handling that records a named fault, cancels and
sweeps active process groups, and ends the run cleanly. Records now reject
events after `run_end`, and a process-boundary regression test covers the
lock-compromise race.
