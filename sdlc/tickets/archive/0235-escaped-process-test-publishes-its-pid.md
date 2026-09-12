---
flow: build
priority: 1
---
# Escaped-process tests publish the child PID deterministically

## Outcome

Both escaped-descendant tests prove bounded capture and always know which process group they must clean up.

## Current facts

Both helpers currently write a PID to a separate file. The first test has a 500 millisecond startup timeout. Under full-suite load, that timeout can kill the helper before it writes the PID. The second test shares the same cleanup structure even though it has not failed.

## Scope

Change only `bot/tests/process.test.ts`. Do not change production source or shared test helpers. Make each generated helper publish its unique first-line PID marker synchronously to standard output immediately after detached spawn and before unref or exit. Accept decimal digits only and require a safe integer greater than 1 before assigning the PID to the cleanup variable. Keep the payload after the marker separate from the marker itself. Separate each helper's startup allowance from the one-second quiet drain or five-second absolute drain.

## Acceptance

Both tests report the full escaped captured text and the process result when the marker is absent or malformed. Both assign the parsed PID before any elapsed or result assertion and kill that process group in `finally`. The quiet-drain test still requires the exact post-marker payload. The absolute-drain test still requires more than ten post-marker continuous-output bytes. The elapsed limits retain explicit startup and drain allowances. Focused repeated runs and the complete check pass.

## Dependencies

None.

## Risk facts

Signals, process groups, and timing set a concurrency floor. Weak cleanup can leak a process after a failed test.

## Complexity

- Contract score: 0
- State and timing score: 2
- Reach score: 0
- Proof score: 1
- Cost of error score: 1
- Total: 4
- Minimum level floor: level 3 for concurrency
- Final level: 3
- Reasons: The change stays inside one test file, but it controls real detached processes, negative process-group signals, and two independent drain timers. An invalid PID could target unsafe cleanup or leave a process behind.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Design review: accepted after the ticket covered both tests, safe PID parsing, exact test-only scope, cleanup ordering, diagnostics, and separate startup and drain budgets
- Code review: accepted after the malformed-marker diagnostic included every process-result state
