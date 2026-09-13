---
base: dce2d6505898c819cd1240362b7f9a863a3c6c08
head: 53f9a11ab77a6b9fd45b5e5a7c33077cb6a71122
---

# Ordinary stored Git states are scanned

Bot now owns an internal functional collector for ordinary SHA-1 stored Git state. It scans regular, executable, and stored symbolic-link blobs from one resolved HEAD and every index stage. It keeps HEAD, stage zero, and conflict stages one through three distinct while caching repeated object reads. Staged add, modify, delete, rename, intent-to-add, detached HEAD, and unborn HEAD have real-repository proofs.

The collector invokes `/usr/bin/git` through a fixed minimal environment. Caller `PATH`, `GIT_DIR`, and `GIT_WORK_TREE` cannot redirect the proved ordinary scan. Complete results contain deterministic labels and secret-detector facts. Refusals contain bounded classifications, counters, and digests instead of candidate bytes, stderr text, environment values, or the supplied root. A real scan of this repository processed 2,708 semantic candidates and returned zero findings.

Independent design review first accepted a complete stored-state security contract after four rounds. Implementation then showed that repository-state interpretation and the adversarial streaming-process protocol needed separate review boundaries. Independent review accepted the narrower functional ticket and required a later prerequisite to harden hostile Git and child-process behavior before any gate can call the collector.

Independent code review rejected SHA-256 behavior that lacked a real-repository proof, an oversized complexity allowance, and a misleading gitlink test name. The remediation refuses non-SHA-1 repositories, pins the exact measured complexity ceiling, and leaves real gitlink proof to hardening. The complete gate then caught five unused helper type exports. The remediation removed them without changing behavior, and independent review accepted the result.

Fifteen focused tests passed. The complete local gate passed 127 repository and documentation tests, 1,692 runtime tests across 203 files, all 143 conformance cases, static checks, and the production-size check under a minimal environment. Hosted runtime run `34721148454` passed on the exact implementation commit. Production size moved from 18,379 to 18,648 nonblank lines.

This completion does not claim linked-worktree, SHA-256, alternate-object, replacement-ref, full hostile-environment, complete parser-table, exact resource-ceiling, or adversarial child-process safety. The next secret-protection ticket owns those proofs and any corrections they expose. Working files, exceptions, proposed history, and gate integration remain separate later tickets.
