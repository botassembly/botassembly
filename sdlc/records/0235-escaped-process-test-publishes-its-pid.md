---
base: ac77d93a2c3505f2bcc7715e77c027c47a8c1231
head: 12927bb99c3fb57ad53d5c4473d398bd54e0b434
---

# Make escaped process tests publish PIDs

Both escaped-process helpers now publish a strict first-line PID marker through captured output immediately after they spawn the detached child. The tests accept decimal digits only and require a safe integer greater than 1 before cleanup can send a negative-PID process-group signal. Each test separates the marker from the measured payload, assigns the PID before assertions, and kills the process group in `finally`.

The design review corrected the ticket to cover both tests, distinguish startup from drain timing, and preserve the continuous-output proof. The first code review found that malformed-marker diagnostics omitted two process-result fields. The remediation added those fields and a regression test. The second code review accepted the result.

Ten repeated focused runs passed before review. The primary local `make check` passed with 71 repository tests, 1,525 runtime tests, and 143 conformance cases. GitHub Actions runtime run `34530296483` passed.
