---
flow: build
priority: 9
---
# Worktree lock holders are cleaned up and ignored

Ticket 0022's lock creates `.bot-runs/` inside the caller's
worktree and never removes it: a crashed run leaves
`<hash>-<uuid>.lock` directories forever, nothing sweeps them
(prune only sweeps the home), and the directory shows as
untracked noise in the very trees other tooling inspects and
seals. Found by the 2026-08-12 post-landing review.

Two questions to settle in design, then implement:

1. Lifecycle: stale holders under `.bot-runs/` are removable the
   same way stale run scratch is — prove staleness, then remove;
   say who does it (run end for its own holder, `bot worktree`
   or prune for orphans).
2. Visibility: whether `.bot-runs/` belongs in the info/exclude
   or gitignore story, and what a sealed inspection should do
   when it sees one.

While in there: the holder name hashes record path, stage,
repeat, and retry AND appends a random UUID. The UUID alone is
the uniqueness; drop the pointless hash inputs or say what reads
them.

## What done looks like

A crashed run's holder is provably removable and something
removes it; a clean run leaves no `.bot-runs/` entry behind; the
lock behavior 0022 pinned keeps exact strength in
`bot/tests/cli-worktree-lock.test.ts` (restatements allowed where
holder naming changes, in design: commits).

## Escalation addendum, 2026-08-13 (architect)

No longer hygiene — a live crash. Run 2026-08-13T00-39-11-73ce
(quickfix 0034) cleaned its worktree, which deleted its own
holder under `.bot-runs/`, and proper-lockfile's `onCompromised`
handler threw uncaught, killing the run with cause "unreadable".
Two hard requirements join this ticket:

1. The holder must survive, or live outside, a worktree clean —
   move it out of the worktree (the bot home already knows the
   run; key by worktree path there) or make the design immune to
   untracked-file deletion. Design decides; "tell agents not to
   clean" is not a fix.
2. A compromised lock must settle the run as a recorded fault
   with a sentence naming what happened — never an uncaught
   throw.

Priority rises to 9: every flight in every repo runs over this.
