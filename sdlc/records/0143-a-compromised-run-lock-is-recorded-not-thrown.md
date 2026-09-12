---
base: 9356ca5f05b8fa469c52c117239e9045c41a1241
head: ddc346722f3dc69c65eb86d6bbde02ce16b994ab
---

# A compromised run lock is recorded, not thrown

Active run holders now turn lost lock ownership into a clean recorded fault that names the run, lock, and heartbeat stall. Root and child runs share the same monotonic heartbeat tracking so readers retain the evidence instead of seeing an unrelated crash.
