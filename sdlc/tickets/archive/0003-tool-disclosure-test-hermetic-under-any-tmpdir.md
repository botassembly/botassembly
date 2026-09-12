---
flow: quickfix
priority: 9
---
The test "invariants 2, 5 and 6" in
`bot/tests/runtime-tool-disclosure.test.ts` must pass regardless of
where TMPDIR points. Today it builds its sandbox via
`mkdtemp(join(tmpdir(), ...))` and then asserts no tool result
matches `/\/(?:home|Users)\//iu` — so if TMPDIR sits under the
caller's home (as it does inside a bot run, where the outer run's
scratch is inherited), the test's own sandbox path trips the pattern
and the test fails with 757 others passing.

Reproduce the red first:
`TMPDIR=$HOME/.cache/red-repro npx vitest run tests/runtime-tool-disclosure.test.ts`
(from `bot/`, after `mkdir -p $HOME/.cache/red-repro`).

The fix, decided: before matching the FORBIDDEN patterns, remove
every occurrence of the test's own sandbox root (the `root` returned
by mkdtemp, and its realpath, since tmpdirs are often symlinked)
from the captured text. Do this at both assertion sites (tool
results and any sibling loop using FORBIDDEN in this file). Do not
move the sandbox to a hard-coded `/tmp`, and do not weaken the
patterns themselves — the test must still catch a runtime that
leaks a genuine home path like `~/.local/share/bot`.

This issue file must be deleted by the landing commit:
`sdlc/issues/tool-disclosure-test-trips-on-inherited-tmpdir.md`.

---
Archive note (2026-08-08): landed by hand as f019962, a cherry-pick of
b05c1ad — the factory's own correct fix from run
2026-08-07T21-57-05-8166, which exhausted on an unmarked checklist
item rather than on the work. Red reproduced on main under
TMPDIR=$HOME/.cache/red-repro, green after the pick, full suite and
lint green. Hand-landed because this red deadlocked the channel: every
other ticket failed its test gate on it, and the fix ticket itself had
burned its attempts during the 2026-08-07 dispatch brick.
