---
flow: quick-fix
priority: 10
completed: 2026-09-04
---
# Owned tree removal always finishes

## Goal

Bot removes an owned temporary or run tree, or returns the filesystem error that prevented removal. It never retries the same permission failure forever.

## Evidence

`bot/src/owned-removal.ts` recursively called `removeOwnedTree` whenever `rm` reported `EACCES` and `restoreOwnedDirectory` could change the reported directory mode. On Linux, a read-only parent that contains another directory made `rm` report a writable child while the parent still blocked removal. Bot changed the child, retried without changing the blocking parent, and repeated forever. A focused reproduction against the original source exceeded a three-second watchdog.

## Result

Owned removal now searches from the reported path toward the owned root, repairs each inaccessible directory at most once, and returns the original error when no repair makes progress. It never follows a symbolic link or searches above the caller-approved root.

The design review rejected the first ticket because its test did not require preservation of the original error code and path. The revised ticket added that requirement and received ACCEPT. Independent code review received ACCEPT with no material findings. The reviewer retained one pre-existing limitation: `lstat` followed by `chmod` has a path-replacement race. Descriptor-based filesystem work would address that larger concern.

## Checks

Red-green evidence reproduced the hang under a one-second watchdog and then passed two focused tests. Ten focused cleanup and caller tests passed. The final `make check` passed 164 test files and 988 tests, 142 of 142 conformance cases, lint, catch-budget inspection, type checking, unused-code inspection, cycle detection, the exact 11,820-line source ratchet, and exact dependency pins.
