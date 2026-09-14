---
base: ac8383855dbf746116f71635c91f80704d148c31
head: f51666b2ef7b31633d9152b8d64d068cf479b23a
---

# Export the remaining read-only readings

`bot/src/command-reading.ts`, private, holds `commandReading(handler, args, cwd, env)`: a boundary that drives a command handler in-process and collects its stdout, stderr, and exit into a `CommandResult`. Ten operations now reach an outside consumer through that boundary. `bot/admin-readings`, a new export path declared in `bot/package.json`, carries `capabilitiesReading`, `homeShowReading`, `homeBusyReading`, `assemblyCheckReading`, and `assemblyListReading`. The existing `bot/run-readings` door gains `runCheckReading`, `runChecklistReading`, `runEventsReading`, `runOutputReading`, and `runRequestReading`. Each function builds the command's own words and returns the exact bytes, stream by stream, and the exact exit code the command writes. `PENDING_EXPORT` now holds only `auth.list` and `model.list`, which need a Pi runtime; `PENDING_MUTATION` holds the nine mutating operations. Requirement L4, the structured refusal reaching an importer as the command's own envelope, now holds for these fourteen, because the CommandResult carries that envelope on stderr.

`bot/tests/library-contract.test.ts` compares stdout, stderr, and exit code for all fourteen counterparts, with a per-operation marker and a stream rule for where to search it. `commandBytes` became `commandResult`, catching `execFile`'s rejection on a nonzero exit for its `code`, `stdout`, `stderr`, and treating a signal kill's undefined code as a failed comparison rather than exit 0. The suite proves the `run.checklist` refusal case and pairs `home.busy`'s quiet mode (exit 1, no bytes) against its JSON mode (`"busy": false` both ways). `bot/tests/command-reading.test.ts` is new: a stub handler writes to `stdout`, `stderr`, and `rawStdout()`, and the test asserts ordering, the stderr capture, and the returned exit code.

Red messages before the fix: `The requested module 'bot/run-readings' does not provide an export named 'runCheckReading'` and four more of that shape, and `Package subpath './admin-readings' is not defined by "exports"`. A second red surfaced on a world-readable fixture home; both sides refuse an insecure home, fixed by chmod 0o700 on the fixture.

Design review accepted the second draft with nine edits after one round: a named typed follow-up, the quiet busy case, the marker stream, the capabilities git reach, side-effect witnesses, the size section, the helper test, citations, and the plan wording; the draft was then cut from 2251 to 1210 words. Code review accepted the result with four minor notes; two were applied (the duplicated flag and valued-option helpers moved into `command-reading.ts`; the capabilities cwd/env reason stated) and two are recorded as limitations: the "changed run name" acceptance case reuses the absent run, so it proves the comparison fails against a mismatched expectation rather than proving a wrapper edit is caught; and plan item 31's wording, dictated as "Planned," is corrected to "Completed" here.

Limitation carried forward: these readings hand back the command's raw bytes, not a typed document, so a consumer still parses JSON itself. The typed layer over these readings is the named follow-up, not this ticket. `capabilitiesReading` reaches git through the default identity resolver in-process, the same resolver the command uses.

The ratchet rose from 18899 to 19061 nonblank lines: 162 lines added against an estimate of 125 to 135, mostly `assemblyCheckReading`'s option encoding. `bot/src/command-reading.ts` holds 43, `bot/src/public-admin-readings.ts` holds 67, and the five new wrappers in `bot/src/public-run-readings.ts` hold 52. `specification/CHANGELOG.md` gained a "Ticket 0295" paragraph naming the new path, the ten operations, and the refusal bytes. `sdlc/planning/plan.md` item 31 is marked completed. The issue `sdlc/issues/2026-09-14-importable-readers-are-not-the-command-surface.md` is closed for the read-only surface and removed; the nine mutating operations remain in `PENDING_MUTATION` for the next library ticket.

The complete local gate ran spec, lint, and test rungs separately in the foreground on the rebased branch: all three exited 0, all 143 conformance cases passed, vitest ran 1791 tests passed, and `node --test` ran 160 tests passed.

coverage: `make -C bot coverage` ran once in the foreground on this branch: 218 test files passed, 1791 tests passed, 143/143 conformance, and the v8 summary reported Statements 87.73% (9772/11138), Branches 81.52% (7526/9231), Functions 90.38% (2640/2921), Lines 92.61% (7662/8273).

Hosted runtime run `34886681598` and hosted docs run `34886681990`, both on commit `f51666b`, completed with conclusion success; each run's `wsl` job shows skipped, the expected state for a push run.

**Decision Ian can overturn:** none.

- Origin: requirement L1 and proposed tickets 2 and 4 of `sdlc/planning/notes/2026-09-14-admin-surface-and-library-requirements.md`, and plan item 31.
