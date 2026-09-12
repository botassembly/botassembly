---
base: db97f3c493605a85b3ec2d0bd404972819b9ccea
head: 162cd7b443fe5d53f4ed171c552fc04685c8e10d
---

Landed removal-time liveness checks for prune, so live runs and scratch are
reported as skipped instead of deleted after stale selection. Install staging
now holds a lock until cleanup, preventing concurrent prune from removing an
active clone.
