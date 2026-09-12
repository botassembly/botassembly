---
base: ea78549a8ed5a796d22b1f543149fd48a8baffd6
head: b0fc8de83ea68994ba425161b6c0bf35f6c8d073
---

Added `bot resume RUN` to derive a new run from a verified dead donor's
assembly, flow, request, and sealed plain-stage prefix. It replaces the
`--continue` flag, preserves donor history, restarts containers fresh, and
keeps child subflows independent.
