---
base: bb0b5928922a7e85bc4b0f6ba42656b42e814286
head: c710a598597be58d384042c13a49a3a19e56dad3
---

A rejected subflow that had already written `run_start` was recorded as not
started, losing the child identity. Rejected calls now retain that child path
and are recorded as started without invented exit or cause fields. The
regression expectation now verifies the incomplete child record, and the
source ratchet covers the added handling.
