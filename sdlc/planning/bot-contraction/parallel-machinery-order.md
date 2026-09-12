# Parallel machinery-failure order

## Boundary

`PARALLEL` already sorts its branches by bytewise name before it gives them to the shared pool. Ordinary unsuccessful results remain indexed by that order. Concurrent machinery rejections must use the same order. Completion timing may change which branches start, but it must not choose the reported fault among branches that did start and reject.

The pool continues to return every rejection with its item index after all started workers settle. The PARALLEL container selects the rejection with the lowest index. It writes the existing `parallel_done` event first, then lets the selected rejection follow the existing flow-fault path. The event remains a bytewise name-ordered account of started and unstarted branches. It does not gain reasons or new fields.

## Locality

`containers.ts` owns this choice because bytewise branch-name order belongs to the PARALLEL contract. `pool.ts` owns bounded dispatch and settlement collection. It has another caller with no assembly branch names, so it should not gain the PARALLEL selection policy.

The existing specification already requires name-order selection when multiple branches fail. No record shape or specification vocabulary changes.

## Red tests

Add one controlled end-to-end PARALLEL test with two branches whose machinery rejects with distinct reasons. Both branches enter before either may settle. Run the scenario twice. Release the later-named branch first in one run and the earlier-named branch first in the other. Both runs must end with `fault/2` and the earlier bytewise branch's reason. Both `parallel_done` rows must list the branches in bytewise name order and mark both started with `fault/2`.

Keep the test free of sleeps. Use latches or deferred promises at the test gating boundary. Assert the observed rejection order before asserting the terminal result so the reversed case cannot pass vacuously.

Existing focused tests continue to cover successful fan-in, ordinary failures, width-limited start order, unstarted branches after a failure, outside signals, and the requirement that already-started siblings settle.
