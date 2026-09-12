---
flow: quickfix
priority: 8
---
# A compromised lock ends the run cleanly

When a run's lock file is deleted out from under it or reclaimed
as stale, the process dies instead of the run ending:

- `lockRun` (`bot/src/inspection.ts:80`) uses `lockSync` with no
  `onCompromised` handler, so proper-lockfile's mtime-refresh
  timer throws bare inside an async callback. No uncaughtException
  handler exists: the process dies mid-run with no `run_end`, the
  record forever reads crashed, and detached agent and gate child
  process groups are never swept. `lockWorktree` at line 97 of the
  same file already handles the identical failure.
- On the worktree side, the compromise race (`bot/src/flow.ts:118`)
  abandons the running stage un-aborted, so it can append events
  after `run_end` — an ending that is not final.

Done, observably: deleting a run's lock mid-run ends the run with
a recorded `run_end` and a swept process tree, never a bare crash;
after any `run_end` no further event appears in that record; the
compromised-lock ending names its cause the way other faults do.

This ticket exists because of
`sdlc/issues/0054-a-compromised-run-lock-kills-the-process-uncaught.md`.

Named for restatement in `design:`/`design-review:` commits: none
expected — new cases land beside the existing lock and record
tests; if a shipped assertion pins the crash behavior, name it in
an addendum before restating.
