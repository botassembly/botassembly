---
flow: build
priority: 3
completed: 2026-09-09
---
# Each coverage invocation owns its output

## Result

The supported coverage command now creates one operating-system temporary report directory per invocation. Vitest receives that exact directory. The inventory verifier reads that invocation's summary before publication. A successful invocation copies the verified summary to a unique staging file beside the retained report and publishes it through one atomic rename. The last completed successful publication wins.

One invocation never cleans another invocation's report or staging file. The retained `bot/coverage/coverage-summary.json` remains ignored and replaceable. The human summary, V8 provider, full `src/**/*.ts` inventory, four dimensions, and absence of percentage thresholds remain unchanged. The production runtime did not change.

The wrapper waits for the producer child's `close` event after success, nonzero exit, signal, or process error. Verification and publication never run after producer failure. A real `finally` boundary removes the owned temporary directory. The first work failure stays primary when cleanup also fails. Wrapper-owned failures produce bounded phase-labelled messages. Failed staging cleanup now produces a second message without replacing the copy or rename failure.

Focused tests overlap two small coverage lifecycles through explicit latches. They prove that the first lifecycle cannot remove or replace the second lifecycle's in-progress report. Real child processes prove nonzero exit and signal behavior. A controlled child error proves that cleanup waits for `close`. Injected failures prove publication and cleanup precedence, retained-report state, and cleanup after output callback failures. The existing zero-argument verifier command keeps its working-directory contract and success line.

## Complexity and review

The design scored 7 and level 3. Separate processes share publication state, child settlement controls cleanup, and failure order determines which report remains. Sol Medium designed and implemented the ticket. Separate Sol Medium agents reviewed the design and code.

Design review required exact nonzero and signal results, cleanup precedence across every phase, retained-summary state after publication, and proof that the zero-argument verifier still works. The revised design passed review.

Code review found three cleanup gaps. A child-process error could start cleanup before `close`. A throwing diagnostic or announcement could bypass owned-directory cleanup. Failed staging cleanup was silent. Commit `9bb2ece1` added the missing red tests and repaired all three paths. The same reviewer accepted the final code without findings.

## Checks

The first focused red run failed because `run-coverage.mjs` did not exist. The first implementation passed eight focused tests and the complete check. Remediation then produced two focused failures: a thrown diagnostic escaped before cleanup, and staging cleanup produced no second diagnostic. The delayed-close case also gained a stronger full-event-loop-turn assertion.

The implementer and reviewer ran the focused and full checks under Node 22.22.3. The primary agent then ran the 11 focused orchestration and verifier tests and root `make check` under Node 22.22.3. The root check passed 42 project tests, 212 runtime test files with 1,466 tests, all 143 conformance cases, and the coverage gate. The verifier reported 102 production modules. Line coverage was 97.05%. `git diff --check` passed. The production source ratchet remains 15,995 of 15,995 nonblank lines. The retained coverage directory contained only `coverage-summary.json`.

The pinned dependency install still reports three moderate advisories. This ticket did not change dependencies. An abrupt process or machine death can leave an owned operating-system temporary directory or a unique staging file. The files cannot remove another active invocation's report. Automated stale-output cleanup remains outside this ticket.

## Source

This manual ticket consumes draft 0224 and started from published commit `c0631d648bc271a4ef0667d6e5e5b038fd6e42a4`. Commits `732bd039` and `9bb2ece1` implement the accepted behavior. Draft 0226 is next under Luna High, subject to a fresh premise review.
