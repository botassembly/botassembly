---
flow: quickfix
priority: 4
---
# Size reporting tolerates a run deleted mid-scan

`directorySize` (`bot/src/inspection.ts:253`) walks a tree with no
ENOENT tolerance. A run unlinked concurrently — another shell's
prune, a manual rm — crashes `bot status` outright, and a mid-loop
throw in prune discards the whole report including the runs
already accounted for.

Done, observably: a file or directory that disappears between
listing and stat contributes zero bytes and the walk continues;
`bot status` and `bot prune` complete their reports while runs are
being deleted concurrently.

From the 2026-08-19 review; this ticket carries the finding.

Named for restatement in `design:`/`design-review:` commits: none
expected.
