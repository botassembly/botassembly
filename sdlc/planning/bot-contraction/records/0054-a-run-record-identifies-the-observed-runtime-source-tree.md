---
flow: build
priority: 8
completed: 2026-09-06
---
# A run record identifies the runtime source tree observed before start

## Result

Every new top-level run records `runtime_tree_sha256`. The digest identifies the Bot-owned source tree observed immediately before `run_start`. It covers the exact bytes and framed root-relative paths of `bot/package.json` and every regular `bot/src/**/*.ts` file in bytewise path order. A subflow child reuses the parent's identity.

The inventory allows at most 256 files, 4 MiB of source bytes, and 1,024 bytes per relative path. Discovery uses a bounded directory buffer and applies file-count and path limits before opening source files. Source opens use nonblocking no-follow flags and validate the held descriptor. Symlinks, nonregular entries, unreadable entries, normalized duplicate paths, short reads, and limit violations fail at the existing pre-start boundary. No run survives that failure.

The record keeps Git commit, lockfile hash, Node version, and provider-adapter version as separate evidence. Retained records without the new additive field remain readable. The public specification now calls this fact an observed disk snapshot. It does not claim to prove which modules Node had already loaded or which bytes an installed dependency contains.

## Review and corrections

Design review first rejected an exact-execution claim. Node loads modules before Bot can measure the checkout. The corrected ticket named an observed source snapshot, closed the Bot-owned inventory, bounded it, and excluded dependency hashing and continuous integrity protection. Fresh design review accepted that contract.

The first code review found two boundary defects. A regular file could change into a named pipe between inspection and open, and the open could block. Inventory limits also applied after whole-tree collection. The implementation added nonblocking descriptor opens, bounded directory iteration, and immediate count and path checks. New deterministic tests reproduce the file-to-pipe replacement and prove oversized discovery stops before a source file opens. The second code review accepted the complete diff.

The first complete repository check found one stale roadmap assertion. It still required exact executed-source provenance to remain future work. The corrected publication test now protects the completed observed-source contract, the separate provenance facts, the loaded-module limitation, and the rule that completed plan items create no automatic successor. Independent review accepted the correction.

## Checks

The focused implementation suite passed 48 tests across runtime provenance, pre-start faults, current event shapes, and structural historical reading. The focused roadmap and provenance suite then passed 15 tests after the publication correction.

The complete root `make check` passed with 19 project tests, 207 Bot test files, 1,368 Bot tests, and 143 of 143 conformance cases. Coverage measured all 101 production modules and reported 91.45 percent statements, 85.21 percent branches, 93.10 percent functions, and 96.36 percent lines. Type checking, lint rules, catch limits, dead-code analysis, cycle detection, dependency pins, the specification gate, the size decision, and the 15,215-line production ratchet passed.

## Size decision

- Starting production size: 15120 nonblank lines
- Ending production size: 15215 nonblank lines
- Simpler approach tried: Preserve the existing useful provenance fields and add one bounded identity for the observed Bot-owned source snapshot.
- Why insufficient alternatives were rejected: Git `HEAD` does not identify dirty source. Requiring a clean checkout prevents normal local development and testing. Proving exact in-memory bytes requires a sealed build and startup boundary.
- Production code deleted: None. The implementation reuses the existing provenance resolver, pre-start fault boundary, provenance object, and child-record path.
- Accepted cost: The behavior adds 95 nonblank production lines and one bounded source measurement before each top-level run. The record identifies disk bytes observed before start. It does not prove the bytes already loaded in memory.
