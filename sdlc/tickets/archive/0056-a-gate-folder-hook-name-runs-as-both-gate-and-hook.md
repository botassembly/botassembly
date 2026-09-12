---
flow: build
priority: 5
---
# A gate-folder hook name runs as both gate and hook

Promoted 2026-08-21 from
`sdlc/issues/0056-a-gate-folder-hook-name-runs-as-both-gate-and-hook.md`
(filed by the 2026-08-19 code review, adversarially verified;
re-verified against today's code at triage — still live).

`machinery` builds one file list for a stage and hands the same
list to two registrars. Gates are selected by path
(`bot/src/machinery.ts:169-170`: `stem(basename(name)) === "gate"`
or `name.startsWith("gate/")`), while `stageHooks`
(`bot/src/machinery.ts:147-155`) matches hook kind on basename
alone, with no exclusion for the gate folder.

A file named `gate/success.sh` — or `gate/before.py`,
`gate/failure.sh` — therefore registers as both. It runs as a gate
on every attempt, where argv is the `$OUTPUT` path and exit 75
means blocked, and again as the stage's hook of that name, where
there is no argv and a hookEvent is recorded. One file, two
contracts, two runs, and the parse layer reports no conflict.

Done, observably: a file inside a stage's `gate/` folder is a gate
and nothing else, no matter what it is named. The author learns
about the collision rather than discovering it at runtime — either
`bot check` refuses the stage with the offending path named, or
hook discovery skips the gate folder outright. Which of those two,
and whether an existing assembly with such a file keeps running,
is the design decision this ticket settles.
