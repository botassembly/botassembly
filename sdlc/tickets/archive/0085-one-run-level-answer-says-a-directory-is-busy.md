---
flow: build
priority: 7
deps: ["0068"]
---
# One run-level answer says a directory is busy

The question the factory's cleanup needs answered is: is any live
run still working inside this directory? Today three mechanisms
overlap to answer it. The run heartbeat (`<run>.lock`, ten-second
staleness, `bot/src/inspection.ts:80`) proves the run is alive. The
run's record says which stage is executing and where. And a third,
stage-level holder registry (`home/worktrees/<hashed path>`,
`bot/src/inspection.ts:91`) re-registers per stage what the first
two already know, so `bot worktree` can look up a directory. The
registry costs its own machinery — the compromise race at
`bot/src/flow.ts:118` lives in it — and it answers at the wrong
granularity: holders release between stages, so a live run's
directory reads idle for an instant in the middle of the run. The
command also always resolves the default home and refuses `--home`
(`bot/src/cli.ts:359`), so a run under another home is invisible to
the probe
(`sdlc/issues/0061-bot-worktree-answers-for-the-default-home-only.md`
— this ticket carries that issue).

Ruled (Ian, 2026-08-19): one liveness mechanism, at run level. A
directory is busy exactly while a live run's work touches it,
derived from the run heartbeat and the run's own record; the
stage-holder registry is deleted, not maintained alongside. The
command renames to `bot busy <directory>` — one operation, one
name, no alias — and accepts `--home` exactly as the other reading
verbs do, answering for that home.

The specification's inspection element states the contract: the
question, exit 0 busy and 1 idle, writes nothing, the ten-second
staleness window, per-home scope, and the run-level meaning — busy
from run start to run end, with no between-stage gap.

Design's to settle: how the probe derives a live run's effective
directories from its record — the `--in` root, per-stage `workdir`
overrides, parallel branches, and subflow children, which are runs
of their own with their own heartbeats.

Done, observably:

- `bot busy DIR` exits 0 while a live run works in DIR — including
  between that run's stages — and 1 otherwise, writing nothing.
- A run launched with `--home` elsewhere makes its directory read
  busy when the probe is asked with that `--home`.
- After the run's process dies without ending, the directory reads
  idle once the heartbeat staleness window passes.
- `home/worktrees/` is never created; `bot worktree` is absent from
  the CLI, help, and the usage list.

Interactions, settled here: ticket 0068 (`deps`) lands first and
its run-lock guarantee — a compromised run lock ends the run with a
recorded `run_end` and a swept process tree — holds unchanged; the
stage-holder compromise path 0068 also repairs is deleted with the
registry. Draft ticket 0053's garbage taxonomy lists orphan lock
holders; once the registry is gone there are no worktree holders to
prune, and the design says what 0053's taxonomy loses.

Consumer: the sdlc `before` script's `worktree_liveness` probe.
The rename is adopted by sdlc ticket 0112, filed alongside this
one. The window between the new bot deploying and the renamed
copies propagating fails closed — the old verb errors, preparation
retains the tree and exits 3 — so the transition refuses attempts
rather than risking trees.

Named for restatement in `design:`/`design-review:` commits:
`bot/tests/cli-worktree-lock.test.ts` and
`bot/tests/cli-help.test.ts` pin the current verb, the holder
registry, and the help text. Restatement is authorized in those two
files, bounded: the verb renames to `busy`, holder-registry
assertions restate to run-level derivation, and help assertions
follow the new surface. Missing, unreadable, or stale is never
live, and the probe writes nothing — those keep full strength. The
usage sentence at `bot/src/cli.ts:377` omits the implemented
`request` verb; the design may fix it in passing.

## Addendum, 2026-08-20 — after a traceability refusal

Attempt 1 refused: `bot/tests/cli-help.test.ts`,
`bot/tests/cli-logs.test.ts`, `bot/tests/cli-request-invalid.test.ts`
and `bot/tests/cli-worktree-lock.test.ts` were changed as
assertion-changing test edits the ticket did not all authorize, and
`cli-logs.test.ts` and `cli-request-invalid.test.ts` were additionally
edited inside an ordinary `code:` commit (379bb78), which is forbidden
regardless of authorization.

The refusal is right on both counts and the fault is this ticket's: it
named two files when the surface it changes is asserted in four. A verb
rename shows up anywhere the usage or help surface is pinned, and
`cli-logs.test.ts` and `cli-request-invalid.test.ts` pin it too.

Restatement is additionally authorized in `bot/tests/cli-logs.test.ts`
and `bot/tests/cli-request-invalid.test.ts`, bounded to assertions on
the usage and help surface that the verb rename changes — the command
list and its wording — and to nothing else in those files. In
particular their own subject matter, what `logs` reports and how an
invalid `request` is refused, keeps full strength.

Everything the ticket already authorized in
`bot/tests/cli-worktree-lock.test.ts` and `bot/tests/cli-help.test.ts`
stands unchanged, with the same bounds.

All four restatements belong in `design:` or `design-review:` commits.
A test assertion changed in a `code:` commit is a refusal on its own,
whatever the ticket permits.

## Addendum, 2026-08-20 — child heartbeat semantics, settled

Attempt 2's design review refused: the code stage must not start until
the child-heartbeat lifecycle and failure semantics are designed, and
no implementation can be made without inventing unspecified behavior.
The refusal is right. The ticket handed design the question of subflow
children "which are runs of their own with their own heartbeats" and
never said what their answers mean. That is a hard choice, and hard
choices belong here.

The governing principle: **busy is the safe answer.** A wrong "idle"
gets a live worktree deleted; a wrong "busy" costs a retry. These are
not comparable, so every uncertainty resolves to busy.

From that:

- A child run is a run. Its own heartbeat governs its own effective
  directories, on the same ten-second staleness window as any other.
- A stale child heartbeat means that child no longer holds its
  directories. It says nothing about the parent: a live parent's
  directories stay busy.
- A live child keeps its directories busy even if its parent's
  heartbeat has gone stale. An orphaned child is still working, and
  its directory is still not safe to remove.
- A directory is busy if any live run's effective directories touch
  it — parent or child, at any depth. Busy wins over idle whenever
  the two disagree.
- A record that cannot be read, a heartbeat that cannot be parsed, or
  a child that cannot be resolved is not proof of idleness. Answer
  busy. Do not treat an error as an absence.

This does not widen the ruling of 2026-08-19; it follows it. One
liveness mechanism at run level, derived from heartbeat and record —
these lines only say how the derivation resolves when parts of the
tree disagree or cannot be read.

Still design's to settle, unchanged: how a live run's effective
directories are derived in the first place — the `--in` root,
per-stage `workdir` overrides, and parallel branches.

The authorization from the previous addendum stands unchanged: four
test files, restatement in `design:` or `design-review:` commits only.

## Addendum, 2026-08-20 — a discarded commit, and traversal errors

Attempt 3's design review refused on two grounds. One is a mistake this ticket caused. The other is right and is settled here.

**The commit no longer exists.** The review refused because "commit `379bb78` changed `bot/tests/cli-logs.test.ts` and `bot/tests/cli-request-invalid.test.ts`" and said that cannot be repaired retroactively. That commit is on no branch. It was discarded when attempt 1's branch was cleared, and survives only under the tag `attempt/0085-20260820-1`, kept so the work is not lost. The branch under review contained four commits and none of them was it. The reviewer found the hash in the addendum above — where it appears as history — and read it as live.

The fault is this ticket's, for putting a commit hash in a rule. The first addendum's closing rule stands and is restated here without one: **a test assertion changed in an ordinary `code:` commit is a refusal on its own, whatever this ticket permits.** Restatements belong in `design:` or `design-review:` commits. Judge that against the commits in the branch under review, not against any hash quoted in this file. The earlier mention of `379bb78` is a record of what went wrong on 2026-08-20 and authorizes nothing, forbids nothing, and describes no commit a later attempt will encounter.

**Traversal errors fail closed.** The review's second finding is correct and is not yet answered: `allEntries` suppresses directory-read errors, so an unreadable child is not reported as unresolvable — it is silently omitted, and an omitted child looks exactly like a child that is not there. The addendum above says an unresolvable child answers busy, but omission never reaches that rule.

So, following the same principle: **a failure to read any part of the child tree answers busy for the directories that failure could have covered.** An error is not an absence. Enumerating children, reading a record, and parsing a heartbeat may each fail, and none of those failures may be swallowed into an idle answer. Where the failure is broad enough that its blast radius cannot be bounded, the honest answer is busy for the directory under question. Whether that means changing `allEntries`, wrapping it, or not using it here is design's to settle.

Nothing else changes. The four authorized test files and their bounds stand exactly as stated above.
