---
flow: quickfix
priority: 10
completed: 2026-09-06
---
# Process cleanup proof does not race child startup

## Result

The process-group cleanup test now controls the command timeout and termination grace with the existing manual clock. It still starts a real detached shell. The shell publishes readiness only after it installs TERM handling. Startup speed can no longer consume the command timeout before the proof begins.

Production behavior did not change. The test still proves that command timeout and a concurrent root sweep share one 250-millisecond grace timer and remove the durable process-group evidence.

## Review and red-green evidence

A 50-millisecond delay before readiness made the former real-time test fail because its 20-millisecond timeout killed the shell first. The controlled-clock repair passed repeated focused runs.

Independent code review rejected the first repair because the shell installed TERM handling before the reproduction delay. That order allowed the former clock to reach readiness. Remediation moved the delay before TERM handling and kept TERM handling before readiness. The former clock then reproduced the failure. The repaired test passed another 20 repeated runs and all 11 process tests.

## Checks

Focused ESLint and `git diff --check` passed. The complete root `make check` passed with 18 project tests, 202 Bot test files, 1,343 Bot tests, 143 of 143 conformance cases, and the unchanged 15,106-line production ratchet.
