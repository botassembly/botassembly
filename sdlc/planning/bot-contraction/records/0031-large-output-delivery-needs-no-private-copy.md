---
flow: build
priority: 10
completed: 2026-09-06
---
# Large output delivery needs no private copy

## Result

`bot run output RUN [STAGE] --raw` now verifies and streams one fixed extent through the same safely held descriptor. It needs bounded memory and no output-sized temporary storage. The first hash must match the record before stdout. The second hash detects a late in-place change and prevents exit zero. Path replacement cannot redirect delivery. Appends do not extend it.

ADR 0028 records the accepted limit. A same-account byte change may reach stdout after the first verification. Callers must honor the exit status.

## Review and red-green evidence

The old implementation required a temporary-directory provider and delivered a private copy after late source mutation. The new focused tests failed before the contraction.

Independent design review rejected an unsupported trust claim and a nonexistent recorded byte count. ADR 0028 now states the narrower guarantee, and the descriptor's initial observed size fixes the extent. Independent code review rejected an overclaim that every first-pass mutation fails before stdout. The final ticket and test distinguish unread bytes from bytes already hashed. Re-review accepted the implementation.

## Size decision

- Starting production size: 15174 nonblank lines
- Ending production size: 15062 nonblank lines
- Simpler approach tried: reuse the existing held source descriptor for both bounded-memory passes
- Why insufficient alternatives were rejected: retaining the private copy would keep the output-sized disk dependency and third full read that this ticket removes
- Production code deleted: 112 nonblank lines
- Accepted cost: an in-place change after initial verification may leave changed bytes on stdout before the delivery hash reports the integrity failure

## Checks

Focused output, held-file, and raw-delivery tests passed. Type checking, focused lint, unused-code inspection, cycles, exact dependency pins, generated documentation, project-owned tests, the 15,062-line ratchet, and `git diff --check` passed. The final root `make check` result follows in the committing session.
