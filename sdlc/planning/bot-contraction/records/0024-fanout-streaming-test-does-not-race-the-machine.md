---
flow: quickfix
priority: 9
completed: 2026-09-05
---
# FANOUT streaming test does not race the machine

## Result

The large-output FANOUT streaming test now uses the harness's manual clock. It keeps the ten-second synthetic stage budget and every existing byte-transfer, final-reader, and scratch-removal assertion. Host scheduling delay can no longer spend the synthetic runtime budget.

Production code did not change. Vitest's 180-second outer test timeout still detects a genuine hang. Dedicated process lifecycle and timeout tests retain real timeout coverage.

## Evidence

The complete suite reproduced the former timeout twice under load at 10.856 and 12.634 seconds. The focused test passed eighteen consecutive repetitions after the change. The full FANOUT runtime file passed all 27 tests. The 11 process lifecycle and timeout tests passed. An independent 30-second operating-system timeout also bounded and passed the focused test.

Independent design and code review accepted the three-line test change without remediation. Focused ESLint and `git diff --check` passed. The production-line delta is zero.
