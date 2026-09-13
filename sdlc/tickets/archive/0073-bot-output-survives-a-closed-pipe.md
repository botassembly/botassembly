---
flow: quickfix
priority: 3
---
# bot output survives a closed pipe

`bot output <run> | head` crashes on EPIPE (`bot/src/cli.ts:91`) —
reproduced during the 2026-08-19 review. A reader closing the pipe
early is normal shell life; the command should end quietly with
success, the way every coreutils writer does.

Done, observably: `bot output <run> | head -c 100` prints the
first bytes and exits without a crash or a stack trace; the same
holds for the other printing verbs if they share the path.

From the 2026-08-19 review (evidence in
`sdlc/issues/0066-code-review-2026-08-19-remainder.md`'s history;
this ticket carries the finding).

Named for restatement in `design:`/`design-review:` commits: none
expected.
