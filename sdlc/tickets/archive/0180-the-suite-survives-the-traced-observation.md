---
flow: quickfix
priority: 10
---
# The suite survives the traced observation

The channel auto-paused on 2026-08-29 after seven faults on the
0178 adoption: the newly propagated green-main proof runs the
gates under an execve tracer, and 31 tests failed at dispatch
(before-evidence log 88) while the plain gate passes 971 of 971.
Reproduced locally the same day: the plain suite is green, and
the traced full suite fails 30 tests. The failures are 30-second
test timeouts under the tracer's slowdown — prune, adoption, and
ceiling tests time out mid-work, and their aborted cleanup then
spills ENOENT noise. Two sibling repos already fixed this exact
class: the canonical repo raised its gate test timeout from 30 to
180 seconds, and the dispatcher repo hardened its deadline-based
tests the same week.

Required behavior: the full test gate passes under the proof's
own wrapper, with no behavioral assertion weakened.

## Reproduction

```
strace -f -qq -e trace=execve -s 0 -xx -o /dev/null -- sh sdlc/scripts/test
```

Done, observably:

- The reproduction command exits zero on the repaired tree.
- `sh sdlc/scripts/test` and `sh sdlc/scripts/lint` exit zero,
  plain.

Boundary: test timing budgets only — the suite's test timeout and
any per-test deadlines the evidence names. Do not change bot's
code, the prune behavior, or what any test asserts.
