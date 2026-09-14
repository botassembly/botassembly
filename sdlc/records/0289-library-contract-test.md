---
base: 29b794bb3b139ffe31926f18ab337a95ba60d013
head: e6923ec0a0f779b1ce7131c67cec89b38d96a0a3
---

# A test holds every operation to an importable counterpart

`bot/tests/library-contract.test.ts` walks all 25 operations named in `CLI_CONTRACTS`. `run.session` is compared live: the command runs with `--raw` on a fixture home holding one recorded run, and the same fixture home is read through `inspectSession`, imported from the package the way an outside consumer imports it, with `raw = true` and `page = undefined`. The two byte streams must be identical. Fifteen read-only operations with no export yet sit in a checked in `PENDING_EXPORT` allowlist; nine mutating operations sit in `PENDING_MUTATION`. A third checked in structure, a map from each operation to its importable counterpart, is the trigger for both directions: an operation absent from the map and from both allowlists fails, and an operation present in the map and in an allowlist also fails. The three sizes are pinned to 25.

Three red demonstrations are permanent tests with exact messages: "assembly.retire has no importable counterpart and sits in no allowlist", "run.list has no importable counterpart and sits in no allowlist", and "run.list sits in the counterpart map and in an allowlist". The change is test-only. Production lines stay at 18882.

Independent design review rejected the first draft for an all-pending allowlist, an imprecise raw comparison, no trigger for the second allowlist direction, and an unstated refusal rule. The revised draft was accepted. Independent code review accepted the revised draft at `517bbaa` and, after a rebase onto `e6923ec`, confirmed the same acceptance. It carried three non-blocking notes forward as limitations: the map value is a free-text label, so a future export could add a key with no live comparison behind it, and the export tickets must add that comparison alongside the key; the CLI path is redefined in the test rather than taken from `tests/boundary.ts`; the live comparison relies on `execFile` rejecting on a nonzero exit rather than asserting the exit code and empty stderr directly.

The complete local gate ran spec, lint, and test rungs separately in the foreground on the rebased branch: all three exited 0, all 143 conformance cases passed, vitest ran 216 files and 1752 tests passed, and `node --test` ran 160 tests passed. `make -C bot coverage` printed `coverage-summary: 124 production modules across four dimensions.`. Hosted runtime run `34879105366` passed on commit `e6923ec`. The hosted docs run for `e6923ec` never started; the queue moved straight to the next push before it began. The later docs run `34879712047`, on the following commit, passed.

Requirement L4, the structured refusal comparison, stays deferred to the export tickets that admit the `PENDING_EXPORT` and `PENDING_MUTATION` entries one at a time.

**Decision Ian can overturn:** none. The three carried notes are limitations the export tickets must close, not open choices.
</content>
