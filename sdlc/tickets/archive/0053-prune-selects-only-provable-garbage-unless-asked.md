---
flow: build
priority: 5
deps: ["0043", "0044"]
---
# Prune selects only provable garbage unless a person asks for more

Today bare `bot prune` selects everything but the newest thirty
runs — an invisible, arbitrary line that puts valid, successful runs
on the chopping block by default, in a format whose whole bet is
that the records are the product. `--count` does not say which side
of the line it counts. `--refused` overrides the guard on runs
prune could not account for, is named after the report's own
refusal labels, and collides with the run outcome `refused` — the
owner of the system could not guess any of the three (2026-08-19).

Ruled (Ian, 2026-08-19): default selection is provable garbage
only — orphan locks beside no run, scratch of ended or missing
runs (as tickets 0043/0044 land it), and dead staging leftovers.
A valid run is never selected unless a person asked for runs.
Report-first stays, and `--delete` remains the only destructive
word; the report's closing line teaches it.

The new selection surface:

- `--age <duration>` selects runs older than the duration.
- `--keep <n>` replaces `--count`: keep the newest n, select the
  rest. An empty or non-numeric value is refused — today
  `--count ''` parses as keep-zero and selects every run.
- The `--refused` flag is removed. A run prune declined to account
  for is removable only by naming it: `bot prune <run> --delete`.
  Naming a run selects it, lock and all; a blanket flag cannot.
- Selectors still add; none narrows another.

Three live-state defects in this selection code are repaired first
by ticket 0067 (prune re-checks liveness immediately before every
removal); this redesign assumes that invariant and must not regress
it:

- The refused-guard ordering consults the sibling lock before
  liveness, so a live run classified `no-record` is deletable
  (issue `sdlc/issues/0063-prune-refused-checks-the-lock-before-liveness.md`).
- The snapshot race where a run starting between snapshot and
  delete loses its scratch
  (issue `sdlc/issues/0049-prune-delete-races-a-starting-run.md`).
- The stray-scratch sweep deletes a live install's staging
  directory mid-clone
  (issue `sdlc/issues/0064-prune-deletes-a-live-installs-staging.md`).

Done, observably: bare `bot prune` reports garbage only, with
sizes; no valid run, live run, live lock, or live staging appears
in any report or removal absent an explicit ask; `--keep` and
`--age` select runs; naming a run selects that run even when its
record is unaccountable; `--delete` removes exactly the reported
rows and nothing else; the removal-time liveness re-check that
ticket 0067 lands holds unchanged under the new flags.

This ticket waits on 0043 and 0044 (`deps`): they are teaching
prune scratch governance now, and this redesign reshapes the
selection surface they land on.

Named for restatement in `design:`/`design-review:` commits:
`bot/tests/prune-selects-only-what-was-asked.test.ts`,
`bot/tests/prune-refuses-every-fault.test.ts`,
`bot/tests/prune-refuses-unreadable.test.ts`, and
`bot/tests/cli.test.ts` pin the current flags and the
newest-thirty default. Restatement is authorized in those four
files, bounded: selection-surface assertions restate to the new
flags and the garbage-only default, and refusal assertions may
restate the named-run path in place of `--refused`. The refusal
principle itself — prune never removes what it cannot account for
without a person naming it — keeps full strength, as does the
report-first, `--delete`-to-act contract.

## Addendum, 2026-08-20 — the design restates what the contract replaces

Attempt 1 refused at code: two shipped tests contradict the approved garbage-only contract, and the code stage may not change an assertion. It named them — `scratch-keyed-by-home` requires a bare prune to omit scratch for an ended stopped run, and `prune-selects-only-what-was-asked` requires deletion of a freshly live orphan lock — while the approved design requires ended-run scratch to be reported and a live reservation lock to be preserved.

The refusal is right, and it is not about permission. Since sdlc 0123 landed, no ticket authorizes test files and no reviewer refuses for a file a ticket failed to name; reviewers judge each test diff by the guarantee it preserves. The paragraph above headed "Named for restatement" is now context about intent, not a list of permissions, and it neither authorizes nor forbids anything.

What went wrong is placement. A design is not finished while a shipped assertion still requires the behavior the ticket replaces. Restating those assertions is part of designing this change, and design and design-review commits are the only place it can happen — leaving them standing hands the code stage a suite it is forbidden to fix, which is exactly how this attempt ended.

For the next attempt: in the design or design-review commits, restate the two assertions named above so the suite expresses the new contract before code begins, and restate any other shipped assertion that requires the behavior this ticket replaces. Say in the commit message which guarantee each change preserves.

Two things keep full strength and are the likeliest to be got wrong. Prune never removes what it cannot account for without a person naming it — an unreadable or unaccountable candidate is reported, never swept. And the report-first, `--delete`-to-act contract stands: a bare prune tells you what it found and removes nothing.

## Addendum, 2026-08-20 — the assertion to restate, named exactly

Attempt 2 refused at code for the same reason as attempt 1, on the same file. The previous addendum said to restate the contradicting assertions and the design did not; it listed `bot/tests/scratch-keyed-by-home.test.ts` among the files it expected to stay green, and code then found it cannot be.

Naming it exactly, so there is nothing left to interpret.

The case is titled **"prune names the scratch this home owns and no run accounts for, and never another home's"**. Its bare-prune expectation lists exactly two entries — the orphaned scratch directory and the stale `install-` staging directory — while the fixture also holds `kept`, a run this home still holds whose record ends in `run_end`. So the case asserts that an ended run's scratch is not listed while that run's directory still exists.

The ruling above replaces that. Default selection is provable garbage, and it names "scratch of ended or missing runs" as two separate cases, not one: a run that has ended is done with its scratch whether or not its directory remains. That is the behavior this ticket exists to establish, so this expectation is the old behavior and must be restated in a `design:` or `design-review:` commit, before code begins.

Restating it means the bare-prune list in that case gains the ended run's scratch. It does not mean the case is deleted or weakened elsewhere. Three things in that same file keep full strength and are the reason it exists: another home's scratch is never listed or removed, a selected live run's scratch is never listed as removable, and the scratch entry stays keyed by home as well as by run.

The report-first contract is unchanged and is not what this is about. A bare `bot prune` still reports and removes nothing; `--delete` remains the only destructive word. Listing an ended run's scratch is not removing it.

The same instruction applies to any other shipped assertion that requires the behavior this ticket replaces, including the live-orphan-lock expectation in `bot/tests/prune-selects-only-what-was-asked.test.ts` that attempt 1 named. If a design finds a shipped assertion it believes the ticket does not replace, it should say which guarantee it thinks is at stake rather than leaving it standing for code to trip over.
