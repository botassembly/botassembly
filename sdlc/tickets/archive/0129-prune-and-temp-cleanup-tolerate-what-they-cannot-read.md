---
flow: build
priority: 10
waits-on: ["botassembly/sdlc/0154"]
---
# Prune and temp cleanup tolerate what they cannot read

`bot prune` walks the run store and dies on the first directory it cannot open. On 2026-08-23 that made the verb unusable outright:

```
$ bot prune --json
EACCES: permission denied, scandir '/home/ian/.cache/bot/tmp/.../bot-fuzz-Ss5sOs/case-4/asm/flows/main'
```

No report, no exit code a caller can act on, and nothing said which of the hundreds of runs was the problem — one unreadable directory anywhere under the store takes the whole verb down.

The directories are bot's own. The fuzz fixtures deliberately create unreadable trees, because refusing to read what it may not read is behavior worth testing. They then survive the run: the stage temp cleanup walks the same tree, hits the same EACCES, and leaves everything behind. So the two failures compound — the cleanup cannot remove the fixture, and the fixture then breaks prune, which is the tool for removing what cleanup left. `~/.cache/bot` held 1.8 GB and 52 unreadable directories when this was found, and an operator had to `chmod` them by hand before prune would run at all.

This is the third time in one day that a walker of bot's own storage has been stopped by bot's own fixtures. The stage temp ceiling did it this morning and had to be reverted from main after it took the botassembly channel down for an hour (0127 re-files it with this tolerance required). A verb that reports on storage and a cleanup that reclaims it must both be able to finish in the presence of a directory they may not open — that is a normal state of the store, not an exceptional one.

## What done looks like, observably

- `bot prune` completes and reports on a store containing a directory it cannot open. It does not exit on the first one, and it does not silently pretend the store is smaller than it is.
- Each entry prune could not fully measure says so, distinguishably from one measured as empty. An unreadable subtree is not zero bytes; a caller reading the JSON can tell "nothing there" from "could not look". The exact spelling is design's.
- Stage temp cleanup finishes in the presence of an unreadable directory, removing what it can. What it could not remove is reported rather than passed over in silence, so debris cannot accumulate invisibly the way 1.8 GB did.
- Removal of an unreadable tree succeeds where the permission on the parent allows it, and where it does not, the failure names the path. A cleanup that cannot remove its own fixtures is the bug being fixed, not a state to accept.
- The proof runs against a tree the test makes unreadable, not a mock. `bot/tests` already builds fuzz fixtures of exactly this shape, so the condition is reproducible without inventing anything.

## What this replaces

Shipped assertions that these walkers propagate a scandir error are the behavior this ticket reverses, and restating them is part of the change. An assertion is in scope because of what it requires — that an unreadable entry ends the walk — not because of what its test is named. Assertions that a *readable* store is measured exactly as it is today keep full strength and must not be loosened: this ticket changes what happens at an entry that cannot be opened, and nothing else about the numbers.

## Boundary

`bot/src/inspection.ts` already holds the precedent this follows: its walker treats an entry that vanished mid-walk as zero rather than failing the run. This ticket extends the same judgment to entries that cannot be opened, in prune and in temp cleanup. Whether the two share one helper is design's call.

Not in scope: changing what the fuzz fixtures create. They are right to make unreadable trees — that is the behavior under test — and a fix that works by making the fixtures tame would prove nothing. Also not in scope: deleting anything prune does not already offer to delete, and any change to what `--json` means beyond the unreadable-entry distinction above.

Related: 0127 requires the same tolerance in the stage temp ceiling sampler, which is a third walker over the same storage. If design finds one helper serves all three, saying so here is welcome; the two tickets are separate because they change different verbs and can land in either order.

## Why this is worth a ticket rather than a chmod

The `chmod` on 2026-08-23 cleared the symptom on one machine. It taught nobody anything and it will be needed again the next time the fuzz suite runs, which is every time the suite runs. The store is meant to be operable by a tool, not by hand.

Found while capturing CLI fixtures for deck 0031, whose declared capture of `bot prune --json` failed for this reason.
