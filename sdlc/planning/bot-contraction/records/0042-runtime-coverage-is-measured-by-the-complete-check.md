---
flow: build
priority: 8
completed: 2026-09-06
---
# Runtime coverage is measured by the complete check

## Result

The complete offline check now runs the Bot test suite once with pinned V8 coverage. It reports line, branch, function, and statement coverage for all 100 production TypeScript modules. Focused `npm test` runs remain unchanged and avoid coverage overhead.

The retained machine summary lives in the ignored and replaceable `bot/coverage/` directory. A verifier rejects missing production modules, unexpected files, malformed totals, and missing dimensions. The coverage command cleans the directory before each run and sets no percentage thresholds.

## Measured baseline

The final complete check measured 96.34 percent line coverage, 91.43 percent statement coverage, 85.21 percent branch coverage, and 93.11 percent function coverage. These values describe observed Vitest worker execution. They do not prove behavioral quality.

The ten lowest modules by line percentage were `src/busy.ts` at 0, `src/process-output.ts` at 63.63, `src/schema-check.ts` at 75, `src/run-lock.ts` at 76.92, `src/prune-measurement.ts` at 80, `src/cli.ts` at 83.83, `src/run-list-command.ts` at 88.23, `src/verified-output.ts` at 88.23, `src/home-config.ts` at 89.18, and `src/prune-inspection.ts` at 90.05. Separately spawned Node processes do not contribute coverage to the Vitest worker report. `src/busy.ts` runs through spawned command tests, so its zero does not mean the behavior lacks tests.

## Review and red-green evidence

Mutation proofs made an unimported production module appear with zero coverage, rejected missing and extra inventory members, rejected malformed dimensions, removed a seeded stale artifact, and preserved a nonzero result for a failing test. Independent code review rejected the first complete run because coverage pressure exposed a fixed-turn race in an existing cleanup proof. Ticket 0043 repaired that test independently. Two later coverage runs passed, including the final root check.

Design review constrained the result to worker-observed coverage, full source inventory, one test run, no thresholds, and no child-process instrumentation. Independent code review accepted the restored implementation after ticket 0043 passed.

## Checks

The complete root `make check` passed with 18 project tests, 204 Bot test files, 1,349 Bot tests, 143 of 143 conformance cases, all 100 production modules in the coverage summary, exact dependency pins, no dependency cycles, and the unchanged 15,106-line production ratchet.
