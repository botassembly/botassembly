---
flow: build
priority: 10
completed: 2026-09-04
---
# A completed command cannot wait forever for a pipe

## Goal

Every command settles its captured output and its own process group within fixed cleanup bounds. One command never terminates a sibling command's group.

## Evidence

At `a0b9a678`, `runProcess` waited for the child `close` event. A descendant could start a new session, retain an output pipe, and outlive the command timeout. A focused reproduction with a 500 ms timeout waited about ten seconds. Calls without a shared process controller also left same-group descendants alive.

## Result

Every command now owns a process-group reservation. A completed direct child retains delayed output during a one-second quiet window inside a five-second absolute drain bound. Bot reports a typed machinery fault when a pipe remains open. Gate, hook, and assembly-install callers cannot report that result as success or a missing source.

Command settlement proves natural group exit or completes the existing 250 ms TERM-to-KILL barrier for that reservation. Root cleanup and command cleanup share the same settlement promise. Sibling reservations remain untouched. Evidence publication and release both finish before `runProcess` returns, including when publication fails first.

The design review rejected the first ticket because it did not define the typed incomplete-capture result, command-local ownership, spawn failure, or the root-cleanup race. The amended ticket received ACCEPT. Code review rejected the first implementation because two repository gates and one test description were stale. The primary review also found an early-return race when evidence publication failed. Remediation added the missing regression and received ACCEPT. The first full check exposed one manual-clock integration test that stopped before the new cleanup barrier. The corrected test received ACCEPT.

## Checks

Forty-two ticket-focused tests passed before the full run. The final `make check` passed 165 test files and 998 tests, 142 of 142 conformance cases, lint, the four-clause catch budget, type checking, unused-code inspection, cycle detection, the exact 11,863-line source ratchet, and direct dependency pins.
