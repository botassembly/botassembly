# Control-container cancellation proof

## Boundary

This ticket proves one existing rule: an outside signal remains the terminal cause while it crosses a control container, and no nested work starts after cancellation. Use one `SIGTERM` case per container. Signal-number mapping already has separate coverage.

Use the real `runFlow` harness in one focused test file. Each active stage enters an asynchronous faux-provider step, announces that entry through a latch, waits for the shared run signal's abort event, and then returns a late response. The test activates `SIGTERM` only after the intended nested work has entered. This exercises the real gating, signal, container, writer, and terminal-run boundaries without sleeps.

## Scenarios

LOOP starts the first repeat and signals it while its stage is active. Assert one matching `signal` event and `run_end`, a signal `stage_end` under repeat 1, no `loop_done`, no second repeat, and no tail.

CHOOSE records a selection and starts that branch. Signal while the selected branch is active. Assert that the `chose` event remains, the selected branch and run end with the signal, and neither the declined branch nor the tail starts.

PARALLEL uses width two and three bytewise-sorted branches. Wait until the first two branches have both entered, then signal. Assert matching signal `stage_end` facts for both started branches, no `stage_start` for the third, a `parallel_done` with two started signal rows and one unstarted row in bytewise name order, and no tail.

## Evidence limit

The implementation tried replacing each container's propagated signal result with success. All three tests stayed green. Root final settlement independently preserves the admitted outside signal, and the sequence runner independently blocks later work after cancellation. Those mutations therefore changed an intermediate value that does not own the observable contract.

Keep the integration tests without that mutation requirement. They add value through the container-specific durable facts: LOOP omits a conflicting ending, CHOOSE retains the completed choice and selected branch identity, and PARALLEL accounts for every started and queued branch after concurrent cancellation. Do not invent a weaker or artificial mutation merely to make the tests fail.

## Scope

Add tests and no production code while current behavior passes. If a scenario fails against current source, stop and return the discovered behavior to design review. Do not change signal precedence, event shapes, control policies, the shared pool, subflows, CLI behavior, or FANOUT.
