---
flow: quickfix
priority: 6
---
# A rejected branch stops the pool like a failed one

In `runPool` (`bot/src/pool.ts:41`), a worker whose `input.run`
settles nonzero stops the pool, but one whose promise REJECTS
never sets stop or decrements active. The surviving workers run
every remaining branch to completion, then `settlementError`
throws, `runParallel` aborts before `parallel_done` is written,
and every branch's work vanishes from the record. A ten-branch
PARALLEL can burn eight branches' agent time after the failure
that already doomed the container.

Done, observably: a branch whose promise rejects halts the pool
exactly as a failed branch does — no further branches start, the
settled branches' outcomes are recorded, and the container writes
its ending event with the rejection as its cause.

This ticket exists because of
`sdlc/issues/0062-a-rejected-branch-never-stops-the-parallel-pool.md`.

Named for restatement in `design:`/`design-review:` commits: none
expected — new cases land beside the existing pool and parallel
tests.
