---
flow: build
priority: 8
---
# Record vocabulary tests time out under suite load

Two independent reviews of ticket 0157 ran `make -C bot test` and timed out both tests in `spec-record-vocabulary.test.ts` at Vitest's five-second default. The tests took 5.8–7.4 seconds while the concurrent suite was heavily loaded. Neither failure reached an assertion.

The same candidate passed the focused file twice, including both tests in 2.87 and 3.07 seconds, and passed the full 939-test suite twice. The exact review command passed once in 34.67 seconds. Base-commit evidence also passed the focused file, with both tests completing in 3.12 seconds. Ticket 0157 changes only specification Markdown and accepted fixture descriptions; it does not change this test, the record constructors, the specification gate, or Vitest configuration.

## What needs shaping

- Determine whether these two process-heavy tests need an explicit test-local timeout or a faster fixture/gate invocation.
- Preserve both mutation proofs and their assertion strength.
- Prove the chosen correction under full-suite concurrency, not only in a focused run.
- Avoid raising the global timeout for tests that should remain tightly bounded.

## Boundary

This is a test-harness timing issue outside ticket 0157's intelligence-documentation sweep. Ticket 0157 must not alter these shipped tests or their timeout to pass review.

## 2026-08-27 promotion

Promoted by the architect seat at priority 8. The cost is no longer hypothetical: ticket 0158 hit this same class of suite-load timeout on three refunded attempts today and is on its fourth dispatch. The "what needs shaping" choices are settled as follows:

- The two process-heavy tests in `spec-record-vocabulary.test.ts` get explicit test-local timeouts sized for full-suite concurrency on this machine, generous enough that only a genuine hang trips them. The global Vitest default stays five seconds for everything else.
- Both mutation proofs keep their assertions unchanged; only the time budget moves.
- The proof runs under load: the full suite passes three consecutive times as the landing evidence, matching the rerun-as-verification discipline.
- If the design finds a cheap way to make the fixture or gate invocation faster, it may take it in addition to the timeout, never instead of the assertions.
