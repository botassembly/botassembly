# Incremental-delivery guard flakes under full-suite coverage load

Ticket 0249 exposed a load-dependent test failure in `bot/tests/hostile-gating.test.ts`. The test "an oversized response is consumed as a stream of deltas, not as one blob" uses the shared four-second real-time `bounded()` guard while processing one mebibyte through more than 100 `message_update` events.

Two complete `make check` runs under Node 22.22.3 failed only at this test during runtime coverage. Vitest reported the test at 4,807 ms in the first run and 4,379 ms in the second. The complete runtime runs otherwise reached 1,590/1,591 passing tests and 143/143 passing conformance tests. The second run took 74.70 seconds. The failure was `hung: incremental delivery` from the guard, not a failed delta-count assertion.

The same test passed three consecutive isolated coverage runs without changing the four-second guard. Its test body took 2.28, 2.26, and 2.26 seconds. The processes exited normally after 4.94, 4.90, and 4.98 seconds. The complete hostile-gating owner file then passed 22/22 under coverage; its test body total took 3.85 seconds and the process exited normally after 6.33 seconds. Earlier focused runs also passed.

The evidence establishes a full-suite coverage load flake. It does not establish a production streaming failure.

## Resolution

Ticket 0249 gave only this resource-heavy proof an eight-second deadlock guard. The change keeps the assertion that more than 100 deltas arrive. A true hang now takes four seconds longer to report in this test. The shared guard and every other hostile proof remain at four seconds.
