---
flow: build
priority: 9
---
# The temporary-storage proof waits for the sample it asserts

Botassembly 0132 exposed an intermittent shipped-suite failure in `bot/tests/tmp-ceiling.test.ts`: the live temporary-storage ceiling reported 9 bytes where the test requires 4. The candidate did not touch temporary-storage code, and an immediate focused rerun passed. Inspection shows that the test's attempted synchronization is not connected to the production sample it is trying to observe.

## Ten whys

1. Why did the assertion see 9 bytes instead of 4? The sampler counted both the readable 4-byte file and the 5-byte file inside the fixture meant to be unreadable.
2. Why could it enter that fixture? The test restored the directory from mode `000` to `700` before the production sampler reached it.
3. Why did the test restore permission that early? It awaited a second call to `directorySize(context.tmpPath)` and treated that call's completion as proof that the sampler's walk had completed.
4. Why is that proof invalid? The second walk and the sampler's walk are separate asynchronous operations; completing one says nothing about the other.
5. Why did advancing the manual clock not complete the sampler? `manualClock.advance()` invokes due timer callbacks synchronously, but the callback starts `directorySize()` with `void ...then(...)` and returns before that promise settles.
6. Why is the sampler detached from the clock callback? Production sampling must not block the timer driver while it performs filesystem I/O.
7. Why can the test not wait for the real completion today? The test harness has no narrow observation point for the sampler promise or its completed measurement.
8. Why did the existing comment claim the second walk was a barrier? It confused doing the same kind of work with awaiting the same operation.
9. Why does an immediate focused rerun usually pass? Filesystem scheduling often lets the sampler finish first, but the ordering is not guaranteed, especially under full-suite load.
10. Why is this a test defect rather than a production byte-accounting defect? Both 9 and 4 accurately describe the directory at different moments. The test changes permissions without synchronizing that change to the exact asynchronous sample it asserts.

## Done, observably

- The proof waits for the actual live-ceiling sample it is asserting before it restores the unreadable fixture.
- The fixture still contains an unreadable 5-byte descendant and a readable 4-byte file under a 3-byte ceiling.
- The recorded fault still reports 4 bytes, proving unreadable descendants are skipped while readable bytes still enforce the ceiling.
- The test no longer uses an independent `directorySize()` call as a synchronization barrier.
- A focused repeated run and the full Botassembly suite pass without the intermittent 9-byte result.

## Boundary

Do not change the ceiling, weaken the 4-byte assertion, add retries, or serialize the suite. Preserve production sampling and accounting behavior. Add only the narrowest test or internal observation seam needed to synchronize this proof with the sampler operation it observes.
