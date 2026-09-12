---
base: 0913e0b1464b13117ca787515d0f16bdf429d24d
head: f2dc6c35b7952f1bf1c383ab6ca5d94a0fe5d108
---

The runtime now warns once before a normal completion destroys non-empty
stage temporary storage. Agents can explicitly empty only their own temporary
storage with `clean-temp`, while the warning preserves evidence and retry
semantics.
