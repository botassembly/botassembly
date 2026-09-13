---
flow: quickfix
priority: 3
---
# A child that started is recorded as started

When a subflow child's promise escapes with a rejection, the
parent records the call with `started: false`
(`bot/src/subflow-runtime.ts:211`) even when the child's own
record holds a `run_start` — the parent's record contradicts the
child's about whether the child existed.

Done, observably: a subflow call whose child wrote `run_start` is
recorded `started: true` whatever ended it; `started: false` is
reserved for a child that never had a record.

From the 2026-08-19 review; this ticket carries the finding.

Named for restatement in `design:`/`design-review:` commits: none
expected — new cases land beside the existing subflow tests.
