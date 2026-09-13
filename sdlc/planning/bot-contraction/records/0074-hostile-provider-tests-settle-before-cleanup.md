---
flow: build
priority: 1
completed: 2026-09-09
---
# Hostile-provider tests settle before cleanup

## Result

The hostile-provider test harness now publishes the exact lifecycle of each scripted provider call. Tests can await a numbered call starting, observing abort, and settling. A bounded guard reports the expected call and state plus the last observed state. The tests no longer treat a pending timeout timer as proof that the provider has started.

The gating fixture now owns one idempotent cleanup operation. It releases a pre-provider latch, advances reachable provider calls in order, triggers timeout or abort, releases owned provider and tool work, and waits for the run before provider settlement. It then waits for tool settlement, harness idle, writer drainage, and root removal. The intentional never-ending stream remains unsettled. It owns no continuation that can touch removed test state.

The timeout-after-abort case proves the provider call starts before the clock fires and observes abort before settlement. Held, truncated, empty-ended, and late-tool cases now await their own settlement before reading final records or cleaning up. A controlled case proves the timeout timer can exist before the provider starts. Two caught-failure cases prove cleanup can recover before the first provider call and during the first call when a second call was registered but never became reachable.

Runtime code, Pi, the manual clock, record facts, public behavior, and production source did not change.

## Complexity and review

The design scored 7 and level 3. Provider streams, abort ordering, multiple promises, manual time, writer drainage, and temporary-root cleanup set the level-3 floor. Sol Medium designed and implemented it. Separate Sol Medium agents reviewed the design and code.

Design review found that early abort could run before Pi created a controller. It required cleanup to release the pre-provider latch and establish the provider before termination. The review also assigned callback and cleanup error ordering to Vitest and made empty-stream result settlement explicit.

Code review found a two-call cleanup deadlock. Cleanup waited for the second call before releasing the held first call. Commit `3869be3f` changed cleanup to advance calls in order and added the missing failure proof. The reviewer then found that provider settlement preceded run settlement. Commit `a7dcd305` restored the accepted barrier order. The same reviewer accepted the final code without findings.

## Checks

Commit `245c8c15` preserves the red proof. The focused suite ran 19 tests. Eighteen passed. The new case failed because the hostile handle had no lifecycle surface after it had already proved that a timeout timer was pending and zero provider-start records existed.

Commits `4085257b`, `07956b1b`, `3869be3f`, and `a7dcd305` implement the accepted test-only lifecycle and cleanup proof. The implementer and primary agent each ran `hostile-gating.test.ts` ten consecutive times under Node 22.22.3. Every run passed all 22 tests. The two other direct consumers passed all 12 tests. The primary root `make check` passed 42 project tests, 211 runtime test files with 1,456 tests, all 143 conformance cases, and the coverage gate. Line coverage was 97.05%. `git diff --check` passed. The production source ratchet remains 15,995 of 15,995 nonblank lines.

The worktree initially lacked Rolldown's pinned Linux binding. The ordinary pinned dependency install restored it. No dependency file changed. No live-provider test ran.

## Source

This manual ticket consumes draft 0223. It started from published commit `2ce113b1980135373b513e6e0fc55b318c8849b4`. Draft 0224 is next under Sol Medium.
