---
flow: build
priority: 10
completed: 2026-09-08
---
# A run listing carries its end time and duration

## Result

`bot run list` now carries `endedAt` and `duration`. The default field order is `id`, `assembly`, `flow`, `startedAt`, `endedAt`, `duration`, `state`, `exit`, `cause`, and `tokens`. `--fields` selects and orders either new field under the existing projection rules.

An ended row reports the exact timestamp string from its accepted `run_end`. Its duration is the signed integer millisecond difference from the accepted `run_start` timestamp. Bot does not round, clamp, or consult the reading clock. A row without an accepted pair reports null in JSON and `-` in Markdown. Human end time uses the existing elapsed-age presentation. Human duration appends `ms` to the exact integer.

The result remains `bot.run.list` schema version 1 under the pre-release change-in-place policy. Capability discovery, generated help, the inspection specification, conformance coverage, the command matrix, and the changelog publish the new vocabulary and default. The legacy `bot runs` output remains unchanged.

## Design review

Independent design review corrected stale claims in source draft 0207 before implementation. The draft named the factory replacement as an observed run-list caller and said tools derived wall time inside `bot show --json`. The admitted observation covered one downstream evaluation tool across 25 retained runs. That tool read `run_start.ts` and `run_end.ts` through the raw record reader and calculated duration itself. The accepted ticket uses only that observed evidence.

The review also closed the output contract. It specifies the expanded default order, exact JSON types, selectable projection order, signed negative differences, null and human `-` behavior, elapsed end-time rendering, reading-clock independence, schema version 1, and required publication surfaces. The change stays reader-only.

## Review and checks

Commit `195dbb05` preserves the red proof before production changes. The focused command was `PATH=/home/ian/.nvm/versions/node/v22.22.3/bin:$PATH npm test -- --run tests/run-list.test.ts -t "run list carries exact retained end times"`. One test failed and 15 were skipped. The failure showed that default JSON omitted both fields, default Markdown omitted both columns, and each explicit field projection exited 2.

Commit `f883156e` implemented the accepted reader change and publication updates. The focused run-list, semantic-boundary, capability, and specification-publication command passed 38 tests across four files. Type checking passed. ESLint and all 29 custom lint-rule cases passed. `git diff --check` passed. The focused run-list suite includes a byte-isolation assertion for the legacy `bot runs` command.

Independent code review accepted `f883156e` without findings. The first full-gate attempt stopped before tests because the two required size-decision values used comma-separated digits. The machine check requires plain digits. The same implementer corrected those two values without changing the source tree.

With Node 22.22.3, the primary complete offline check then passed. It ran 19 project tests, 210 runtime test files with 1,438 tests, and 143 of 143 conformance cases. Coverage reported 97.06 percent of production lines across 105 production modules. The source ratchet passed at 15,998 of 15,998 nonblank lines.

No live-provider test ran.

## Size decision

- Starting commit: `a5b8d677`, the current main baseline that records the disabled Pages deployment
- Starting production size: 15989 nonblank lines
- Ending production size: 15998 nonblank lines
- Net increase: 9 nonblank lines
- Simpler approach tried: extend the shared run-state fact that already reads the accepted start and final end once, then let the noun run-list projection and renderer expose those facts.
- Why insufficient alternatives were rejected: the legacy state string cannot recover an end timestamp. Reading the record again inside `run-list.ts` would duplicate record selection and add another file read. Existing elapsed display code clamps and rounds for human history. It cannot supply the exact signed integer required here. Existing structured run results receive `endedAt` from live execution and do not serve retained run listings.
- Duplication search: `rg -n "endedAt|duration|Date\\.parse\\(.*ts|run_end" bot/src` found the structured run result, human history timing, stage-attempt timing, session tool-call timing, and record selectors. None exposes an exact signed retained-run duration through the shared summary reader.
- Production code deleted: none. The legacy listing still requires the shared state reader, and its deletion waits on the caller-migration trigger.
- Reason: nine nonblank lines add two shared facts, the closed field vocabulary, exact calculation, null handling, and human rendering without a second record read or a new dependency.
- Accepted cost: nine maintained production lines and two additive version-1 fields. Every other change is test or publication evidence.

## Source

This manual ticket came from draft 0207. The draft is consumed by this record. Draft 0209 is next.
