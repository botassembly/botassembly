---
base: 0509559d09627e3af495ec8622ae2b437f10c2e0
head: 3a1c82f7bd03ff7cc0db458072a61d23c9c1047e
---

# Export command readings

An outside consumer now imports `run.list`, `run.show`, and `run.record` from a new `bot/run-readings` export path and gets the same bytes the command writes. `bot/src/public-run-readings.ts` re-exports `inspectRunList`, `parseRunList`, and `runListFailure` unchanged and adds two wrappers. `runShowReading(home, run, json, env)` derives its scratch root by calling `scratchRoot(env)` itself and reproduces `run-show-command.ts`'s fault mapping: the chosen buffer on success, a structured `run.show` failure on rejection. `runRecordReading(home, run)` calls `inspectRawShow` with an in-memory writable and a collecting stderr callback and returns the collected buffers with the returned exit code.

`inspectShow` and its two dead helpers, `showChild` and `childUnavailable`, are deleted from `bot/src/one-run.ts`. `inspectRuns` comes off the `./inspection` export door but stays exported from `bot/src/inspection.ts` for its two remaining internal test callers. `inspectRawShow`'s return type narrows from `number` to `0 | 1`. `specification/elements/inspection.md:211` now calls `inspectRuns({ usage: true })` internal instead of public. A `specification/CHANGELOG.md` entry names the new export path and the two retired readers. The ratchet at `sdlc/ratchet.json` rises from 18878 to 18882.

`bot/tests/library-contract.test.ts` moves `run.list`, `run.show`, and `run.record` out of `PENDING_EXPORT` and into `COUNTERPARTS`, each compared live and byte for byte against the command on one fixture home: `bot run list --json` against `inspectRunList`, `bot run show --json` against `runShowReading`, and `bot run record --raw` against `runRecordReading`. `PENDING_EXPORT` now holds twelve read-only operations and `PENDING_MUTATION` holds nine mutating operations.

Design review rejected the first draft for two operations whose fault path lives in the command handler rather than an exported function, an unexported scratch root argument, an unreachable red demonstration, and unspecified function signatures. The revised draft was accepted. Independent code review accepted the revised draft at `a81f663`, then the changelog wording was corrected at `3a1c82f` because it overclaimed that `run.list`'s home fault travels through the export; that fault stays in the command handler, and `runListFailure` only builds it for a consumer that needs it.

Three limitations carry forward from code review, unresolved by this ticket: the live comparison checks stdout only, so `runShowReading`'s and `runRecordReading`'s duplicated fault mapping is not proven live on exit code or stderr; `run.show`'s live comparison runs in JSON mode only, so the human-readable buffer is untested; and a later change to `run-show-command.ts` that skips the exported function would diverge silently, since the live comparison is the only thing that would catch it.

The complete local gate ran spec, lint, and test rungs separately in the foreground on the rebased branch: all three exited 0, all 143 conformance cases passed, vitest ran 216 files and 1758 tests passed, and `node --test` ran 160 tests passed. Hosted runtime run `34881814020` and hosted docs run `34881814465`, both on commit `3a1c82f`, completed with conclusion success; the runtime run's `wsl` job shows skipped, which is the expected state for a push run.

A later foreground run of `make -C bot coverage`, taken independently for this record, shows one unrelated failure: `tests/cli-auth-login-contract.test.ts`'s real Pi auth lock test timed out at 180000ms. The summary line reads `Test Files  1 failed | 215 passed (216)` and `Tests  1 failed | 1757 passed (1758)`. That test exercises OAuth refresh locking in `bot auth login`, not any file this ticket touched, and the hosted runtime run on the same commit passed its `check` job complete, so this reads as a timing flake rather than a regression from this change.

`run.output` and `run.request` stay in `PENDING_EXPORT`: their fault-to-bytes rule lives in the module-private `copySelected` in `bot/src/run-output-command.ts`, so a wrapper built from their already-exported pieces would match the command only on the happy path. A sibling ticket that gives that rule an exported home carries them. Requirement L4, the structured refusal comparison, stays deferred; it already falls out for `run.list` alone, because `inspectRunList` returns a refusal as its result rather than throwing.

**Decision Ian can overturn:** none. The three code-review limitations above were named and accepted rather than fixed in this ticket.
