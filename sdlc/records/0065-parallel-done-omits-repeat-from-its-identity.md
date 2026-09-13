---
base: d04e195e6e472a97bafb92d44f2eda00698e296b
head: a882d420c57b1a6796c06dede833fb5d2af5b9eb
---

`parallel_done` now carries a loop repeat when the PARALLEL runs inside a
LOOP. This distinguishes each completed fan-out while preserving the existing
identity for a standalone PARALLEL. `loop_done` remains repeat-free because its
`repeats` field describes the loop as a whole.
