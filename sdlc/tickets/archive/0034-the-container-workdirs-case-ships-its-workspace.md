---
flow: quickfix
priority: 11
---
# The container-workdirs case ships its workspace

Main is red: conformance case `accept/container-workdirs` (landed
by ticket 0018) invokes `./assembly/change --in ./workspace` but
the case directory contains no `workspace/`. The flight's worktree
had it untracked, so verify passed there and the landing lost it —
git does not carry an empty or forgotten directory. The sibling
case `accept/stage-workdir` ships `workspace/investigator/marker.txt`
for exactly this reason.

Fix: add the `workspace/` fixture the case actually needs — read
the case's assembly and `expected.jsonl` to determine required
contents (the stages read `request.txt` and declare workdirs
`./alpha`, `./beta`, `./shared`), using the sibling case's
tracked-marker convention for any directory that must exist empty.
`bot/tests/conformance-passing.txt` already ledgers the case and
must not change.

Done is: the conformance suite passes from a fresh clone of
origin/main.

## Fault addendum, 2026-08-13 (architect)

The first attempt crashed itself: this run's own liveness lock
lives untracked at `.bot-runs/` inside the worktree, and cleaning
the worktree (git clean or equivalent) deletes it, which kills the
run mid-flight. Do NOT clean this worktree. Verify the
fresh-clone behavior by cloning origin/main into a directory under
$TMP and running the conformance suite there — never by cleaning
the tree you are working in.
