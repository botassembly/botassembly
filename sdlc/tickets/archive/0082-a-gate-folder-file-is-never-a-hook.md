---
flow: build
priority: 6
---
# A gate-folder file is never a hook

`stageHooks` (`bot/src/machinery.ts:149`) walks every file under a
stage folder and matches hook kind on basename with no exclusion
for `gate/`, while `bot/src/stage.ts:128` registers gate-folder
files as gates. A file named `gate/success.sh` (or
`gate/before.py`, `gate/failure.sh`) registers as BOTH, and runs
twice under two different contracts: as a gate on every attempt
(argv is the `$OUTPUT` path, exit 75 means blocked) and again as
the hook of that name (no argv, hookEvent recorded). The parse
layer validated no hook at all.

The hard choice, settled: refuse at `check` rather than exclude
silently. A gate named after a hook is almost certainly a
misplaced hook, and this format's habit is to tell the author at
check time, not to guess. The refusal names the file and says
where a hook of that name belongs. The specification's gate and
hooks elements gain the sentence, and the conformance corpus gains
a refuse case, so any runtime must agree.

Done, observably: `bot check` refuses an assembly holding
`gate/before`, `gate/success`, or `gate/failure` (any extension),
naming the file; a gate under any other name runs once, as a gate,
exactly as today; the corpus pins the refusal.

This ticket exists because of
`sdlc/issues/0056-a-gate-folder-hook-name-runs-as-both-gate-and-hook.md`.

Named for restatement in `design:`/`design-review:` commits: none
expected — the collision was never a supported shape; new refuse
cases land beside the existing gate-folder corpus cases and
`bot/tests/cli-gate-folder-faults.test.ts` may grow the new fault
without weakening any existing one.
