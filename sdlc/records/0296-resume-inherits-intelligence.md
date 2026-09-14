---
base: 4291b3f
head: 189004f
---

# Resume inherits the donor's command-rung intelligence

`bot run resume RUN` now runs on the intelligence the donor's command rung named. Resume reads the intelligence name the donor's command rung recorded on its first `stage_start`, resolves that name through the current home `intelligences` table, and records `intelligence`, `model`, `reasoning`, and `provider` when the row names one, all at the `command` rung of the new run. A donor that recorded no command-rung name resolves as before, through the assembly, the home, and the defaults. Resume still refuses `--intelligence` and every other command option; any existing command options carry through the resume amendment unchanged.

The per-stage half of the issue is dropped by ruling: the assembly hash identifies what runs, so a command option repointing one stage would leave that hash untouched. `sdlc/issues/2026-09-14-intelligence-override-misses-resume-and-one-stage.md` is removed. `specification/elements/invocation.md` gained the resume resolution sentence and a sentence stating the command rung is run-wide with no per-stage spelling, the stage rung being the per-stage choice. `specification/CHANGELOG.md` gained a "Ticket 0296" paragraph under `## 2026-09-14`. The ratchet rose from 19061 to 19079: 18 lines in `bot/src/resume.ts` for the donor intelligence reader, the amendment helper, their comments, and a mapping import.

Design review rejected the first draft for an unrunnable fixture model, the unaddressed recovery floor, five wrong cites, and two thin edge cases, then accepted the revision.

Code review rejected the first implementation once, on three grounds: the ticket's size facts did not match the measured total, an untested cost (a dropped inherited intelligence row between donor run and resume) was claimed but not pinned, and the specification claim overstated what a providerless home row records. The remediation, commit `189004f`, corrects the starting production size to 19061 and the added-line count to the measured 18; adds a test that drops the inherited intelligence row from the home between the donor run and the resume and pins the `intelligence-unresolved` refusal with the home still holding only the donor run; narrows the specification and changelog wording to say intelligence, model, reasoning, and provider only when the row names a provider; and states in comment that the command rung outranks every other rung. Code review accepted at `189004f`.

The complete local gate ran spec, lint, and test rungs separately on the rebased branch: all three exited 0, 218 test files passed, 1794 tests passed, and conformance ran 143/143.

## Honest limitations

The per-stage override named in the source issue is dropped, by ruling, not by oversight: a command option repointing one stage would leave the assembly hash untouched, and that hash must identify what runs. The refusal for a dropped inherited name happens after the run directory is created. Validation runs at `bot/src/run.ts:209`, birth at `:322`, and the unborn cleanup at `:330` removes the directory, so the refused resume leaves no run behind, but the refusal is not a pre-birth check.

## Hosted runs

Hosted runtime run `34888212730` and hosted docs run `34888213207`, both on commit `189004f`, completed with conclusion success; the runtime run's `wsl` job shows skipped, the expected state for a push run.

**Decision Ian can overturn:** none.

- Origin: `sdlc/issues/2026-09-14-intelligence-override-misses-resume-and-one-stage.md`, filed 2026-09-14, proposed ticket 10 of the 2026-09-14 admin surface and library requirements note.
