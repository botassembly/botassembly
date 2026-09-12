---
flow: quickfix
priority: 8
---
# Prune re-checks liveness immediately before every removal

Prune decides what is removable from answers that can be stale by
the time it deletes, three ways, all data loss:

- `pruneDecision` (`bot/src/prune-inspection.ts:70`) consults the
  sibling lock before the stillRunning guard, so with `--refused` a
  live run classified `no-record` — including any run in its birth
  window, lock present but record not yet written — is deletable,
  and the running-run skip below is dead code. Contrast
  `pruneScratchEntries` (line 179), which skips on lock OR
  stillRunning unconditionally.
- The run-name snapshot is built once, then deletions proceed; a
  run starting between snapshot and delete can have its live
  scratch read as an orphan and removed.
- `orphanScratch` (`bot/src/prune-inspection.ts:143`) treats every
  non-run-name directory under the scratch home as a stray, but
  `bot assembly install` mkdtemps its live `install-*` staging at
  that level (`bot/src/management.ts:83`); a concurrent
  `bot prune --delete` removes the staging mid-clone and install
  emits a false refusal.

One invariant repairs all three: **nothing is removed whose
liveness was not confirmed immediately before its removal.** A
lock, a live run, or live staging found at removal time is skipped
and reported, whatever selection said earlier.

Done, observably: a run started after selection keeps its
directory and scratch; a live run selected by `--refused` is
skipped and reported, never removed; an in-progress install's
staging survives a concurrent `prune --delete`; everything the
report promised to remove and that is still dead is removed.

This ticket exists because of
`sdlc/issues/0049-prune-delete-races-a-starting-run.md`,
`sdlc/issues/0063-prune-refused-checks-the-lock-before-liveness.md`,
and `sdlc/issues/0064-prune-deletes-a-live-installs-staging.md`.
Draft ticket 0053 redesigns prune's selection surface separately
and builds on this invariant.

Named for restatement in `design:`/`design-review:` commits:
`bot/tests/prune-selects-only-what-was-asked.test.ts` and
`bot/tests/prune-refuses-every-fault.test.ts` pin the current
decision order. Restatement is authorized in those two files,
bounded: assertions may add the removal-time liveness re-check and
its skip rows; the selection discipline and every existing refusal
guarantee keep full strength.
