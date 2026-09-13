---
flow: build
priority: 10
completed: 2026-09-09
---
# The live inspection rung uses current command contracts

## Result

The smoke driver now reads exact positive token totals from `bot run list --fields id,tokens --limit 200 -j`. A missing, malformed, duplicate, zero, incomplete, or wrong-run result stops the rung before its validator can report green. S2 verifies both run totals before it adds them.

S6 now reads the complete bounded run list through `bot run list -j`, reads exact record bytes through `bot run record --raw`, and reads accepted output through `bot run output --raw`. It compares stable machine facts instead of elapsed display text. It keeps human `bot show`, `session`, `logs`, `status`, `check`, and `prune` where no noun replacement exists. The dry prune now uses the supported `--keep 0` form. S8 and S10 also use `bot run output --raw`.

Raw record bytes never authorize a filesystem read in the validator. S6 passes output and session selection back through Bot's validated readers. It hashes returned output bytes against the record's sealed SHA-256. The runtime symlink test proves that inspection readers do not follow a record-controlled link.

The smoke README and legacy retirement ledger now match the executable callers. The ledger still requires every smoke invocation to use the noun surface before the legacy layer can be deleted. Human `bot show` remains until a replacement exists.

## Complexity and review

This was level 2. One smoke inspection boundary owned the fault, but the repair crossed the driver, shared smoke helpers, S6, S8, S10, documentation, and the retirement ledger. Luna High implemented it. Sol Medium supplied independent design and code review.

The first implementation passed the saved replay but failed review. It trusted paths from raw forensic record bytes, accepted zero token totals, assumed the default 20-row page covered the home, left S8 and S10 on the old output command, weakened the retirement condition, trusted JSON property order, and claimed every run ended while checking only that none crashed. Luna corrected those findings. Sol then proved that lexical containment still followed a symlink outside the run. Luna removed every direct filesystem read based on a raw-record path and delegated those reads to Bot's validated commands. Sol accepted the final implementation.

## Checks

The focused machine-result suite passed eight tests. The saved live session replay passed all 47 S6 assertions without a provider call. The existing output and symlink suites passed. `bash -n smoke/run.sh` and `git diff --check` passed.

The final complete offline check passed 38 project tests, 211 runtime test files with 1,454 tests, all 143 conformance cases, and 97.07 percent line coverage. The source ratchet stayed at 16,056 because runtime source did not change.

The primary complete check first found an unrelated 180-second timeout in the assembly-update SIGKILL test after the other 1,453 runtime tests passed. An immediate focused rerun passed all three tests in 10.24 seconds. An earlier 60-second observation existed in the planning archive, so `sdlc/issues/2026-09-09-assembly-update-sigkill-test-timeout.md` now keeps both observations and the investigation lever.

The saved live session came from ticket 0068's trailing-slash `TMPDIR` acceptance run. Every model rung passed. S6 first exposed this ticket's stale readers. After the repair, the primary agent moved S5's sealed answer aside, observed exactly one named S6 failure, restored the original SHA-256, and replayed all 47 assertions green. The falsification ledger carries the exact evidence.

## Source

This manual ticket consumes draft 0221. Ticket 0068 can now finish draft 0206 with the required unset-`TMPDIR` live ladder.
