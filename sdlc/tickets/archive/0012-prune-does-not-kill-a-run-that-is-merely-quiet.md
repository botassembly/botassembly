---
flow: build
priority: 7
---
# Prune does not kill a run that is merely quiet

A run is alive while it holds its lock, and liveness is a 10-second
mtime staleness heuristic (`LOCK = { stale: 10_000 }`,
bot/src/inspection.ts). A holder that is alive but not refreshing — a
suspended process, a machine waking from sleep, a slow filesystem —
reads as crashed, and `bot prune` will delete the run directory out
from under it. Flagged by the 2026-08-10 outside review: destruction
should demand more proof than an old timestamp.

## Behavior

Corrected 2026-08-10 after the reviewing agent's repro: proper-lockfile
stores only an empty `.lock` directory — no pid, no hostname, no start
identity — so there is NO automatic proof of death available, and a
grace interval cannot help because a sleeping process can outsleep any
grace. The reviewer aged a held lock by 60 seconds and watched prune
delete the live run, its evidence, and the lock.

- Any existing lock makes destructive prune refuse that run, whatever
  the timestamp says, with output naming the run and the lock.
- A human override flag prunes a named run despite its lock — explicit,
  per-run, never the default.
- The run/record path is untouched: running code takes and refreshes
  locks exactly as today; only prune's deletion decision changes.
- If automatic proof of death is ever wanted, that is a future ticket
  adding holder identity (hostname, pid, start identity, nonce) to the
  lock content itself — do not build it here and do not fake it from
  mtime.

## Tests you are authorized to restate

- Inspection/prune tests pinning the stale-means-dead rule restate to
  the verified-dead rule. A new test holds a lock without refreshing
  and shows prune keeping the run.
- Refusal addendum (2026-08-10, second and decisive): ANY existing
  assertion, in any test file, that requires a locked run to be
  silently omitted from prune's selection, output, or reporting is
  authorized to restate to the new contract — every selected locked
  run appears as `refused-<run>.lock`. The silent-omission behavior
  IS the defect this ticket removes; a test pinning it is pinning the
  bug, and the two refusals correctly surfaced that the old contract
  is load-bearing in five places. Assertions that a run directory
  survives, and all behavior for unlocked runs, keep full strength.
  This is not authorization to weaken anything else.
- Third addendum (2026-08-10), naming the exact assertions after the
  operator ran the blocked worktree's suite: the omission pins live in
  `tests/inspection-corrupt-run.test.ts` ("bot prune keeps a
  record-less run, never lists it while it is live, and takes it with
  --refused"; "a live record-less run lists as running, and reads
  no-record again once its lock is gone") and
  `tests/inspection-record-shapes.test.ts` ("prune passes over a LIVE
  unreadable run and refuses that same run once it is dead"). Those
  three restate to the refused-<run>.lock naming; every other
  assertion in both files keeps its exact strength.
- Fourth addendum (2026-08-10), completing the enumeration from the
  fourth refusal: `tests/inspection-conformance.test.ts`,
  `tests/orphan-run-lock.test.ts`,
  `tests/run-birth-reservation.test.ts`, and
  `tests/run-capture.test.ts` are ALSO named. In all six named files,
  any assertion that pins prune silently omitting, passing over, or
  not reporting a run guarded by a physical lock restates to the
  refused-<run>.lock contract. Assertions about run survival,
  `--delete`/`--refused` taking a named run, orphan-lock accounting
  (bytes, listing), and every non-lock behavior keep their exact
  strength. No file outside these six may be restated.

The src line ceiling may rise by at most 20 lines.
