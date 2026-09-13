---
flow: build
priority: 1
completed: 2026-09-09
---
# The assembly-update crash proof has a deterministic boundary

## Result

The assembly-update crash proof no longer searches for a short rename window by scanning 4,000 files in a synchronous loop. A separate child now pauses after the installed tree moves aside and before the staged tree takes its name. The parent sends a real `SIGKILL` at that exact boundary.

The test compares ordered paths, entry kinds, file bytes, executable bits, and link targets. It proves that the installed name is absent while the exact old tree remains aside and the exact new tree remains staged. The same state remains after the child dies. Restoring the old tree by one rename makes the assembly readable again.

The child settlement listener exists before readiness can arrive. One cleanup path covers all work after spawn. It stops a live child, waits for settlement, removes its listeners, and clears the guard. A deliberate assertion failure proves that path reports `SIGKILL` settlement and leaves zero child listeners.

The runtime update order did not change. One optional internal callback exposes the existing boundary to tests. The ordinary process boundary omits it. No command, environment variable, package export, specification, or output changed.

## Complexity and review

The design scored 7 and level 3. Recovery timing, a real child process, exact filesystem state, and the cost of a false green set the level-3 floor. Sol Medium designed and implemented it. Separate Sol Medium agents reviewed the design and code.

Design review first found that a failed disk assertion could leave the child blocked. The accepted ticket added one cleanup path for every post-spawn outcome. Code review then found that the implementation started that cleanup boundary after listener setup and did not force a negative cleanup case. Commit `6dd51cc2` moved the boundary immediately after spawn and added the missing proof. The same reviewer accepted the remediation without further findings.

## Checks

Commit `620cd7b0` preserves the red proof. Without the callback, the focused case failed in 2.5 seconds with `child settled before readiness`, exit code 0, no signal, the exact new tree installed, and no staged or aside tree. Type checking also rejected the missing callback.

Commits `3bf66909` and `6dd51cc2` implement the callback and accepted cleanup proof. The implementer, code reviewer, and primary agent each ran the focused file ten consecutive times under Node 22.22.3. Every run passed. The primary root `make check` passed 42 project tests, 211 runtime test files with 1,452 tests, all 143 conformance cases, and the coverage gate. Line coverage was 97.05%. `git diff --check` passed. The production source ratchet remains 15,995 of 15,995 nonblank lines.

No live-provider test ran.

## Source

This manual ticket consumes draft 0222. It started from published commit `3e4d74593508df360d05cf5bd00729a05aaeeb6e`. Draft 0223 is next under Sol Medium.
