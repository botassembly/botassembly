---
flow: quickfix
priority: 30
---
# Give prune process tests the process-boundary budget

This absorbs `sdlc/issues/2026-08-26-prune-summary-timeout-remains-unexplained.md` after the retained preflight evidence made the cause observable.

The process-heavy tests in `prune-selects-only-what-was-asked.test.ts` build homes containing 33 runs and invoke the real CLI, sometimes several times in one test. Under the factory's parallel preflight load, five of those tests each exhausted Vitest's generic five-second test timeout. One timed-out teardown then removed a directory while `proper-lockfile` was still updating it, producing an unhandled `ECOMPROMISED` error. The same repository already defines a 30-second `BOUNDARY_MS` test budget for real child-process boundaries, above the child's own finite guard, but this file does not use it.

Done, observably: every test in this file that exercises the real CLI across the large fixture uses the existing process-boundary test budget, so the inner child guard remains able to name a genuine hang. The focused file passes repeatedly under representative parallel load and the complete Botassembly suite passes. Production prune behavior, fixture size, selection and accounting assertions, the child-process guard, and the global Vitest timeout do not change. A larger timeout must not turn a hung child into an unbounded wait.
