---
flow: build
priority: 8
---
# A broken failure hook never rewrites the stage's true ending

A `failure` hook that runs and exits nonzero already changes
nothing — `bot/src/executables.ts:51` treats any exit from a
failure hook as passed, exactly as the spec promises ("`failure`
runs after the fact, so its exit code changes nothing",
hooks.md). But a failure hook that *breaks* — times out, cannot
execute, overflows the output ceiling, or fails its hash
recheck — comes back terminal, and `afterFailureHook`
(`bot/src/gating.ts:33`) then replaces the stage's ending with
the hook's: `return { ...failure, judged: ending.judged, ... }`.

So a stage that honestly failed its gate (exit 1, cause
`exhausted` or `rejected`) ends instead as exit 2, cause `fault`
or `timeout`, because a cleanup script hung.

Why this matters, concretely:

- **The record lies about the work.** The run's one-word cause is
  the thing every downstream reader trusts instead of the
  transcript. Here the recorded cause names the janitor's
  accident, not the work's verdict. "Honest endings" is a named
  principle; this is the one code path that breaks it.
- **It flips dispatcher behavior.** The factory holds on a
  refusal and retries a fault. A gate failure masked as `fault`
  gets retried as if the machinery had hiccuped, burning
  attempts on work a check already judged; conversely the true
  signal ("the output failed the gate twice") never reaches the
  ticket's events.
- **Nothing is gained.** The hook's breakage is already in the
  record — `runExecutable` appends the `hook` event with its
  exit before the ending is judged — so demoting the stage's
  cause reveals nothing a reader could not already see.

Ruling this ticket proposes: **the work's own ending always
wins.** A failure hook's breakage is recorded (the existing
`hook` event; a timeout or non-execution may add its capture)
and never replaces the stage's cause, exit code, or the run's.
The spec sentence to add to hooks.md: a `failure` hook's own
failure is recorded but changes nothing — the stage has already
ended.

One boundary stays: hooks.md also says a hook that could not
execute at all is a broken assembly. That remains true *before*
work starts — `before` and `success` hooks keep their terminal
force, and validation still refuses what it can see. Only the
after-the-fact `failure` hook loses the power to rewrite
history, because by the time it runs there is no future for it
to protect, only a past for it to misreport.

Done, observably:

- A stage whose gate fails and whose `failure` hook times out
  ends with the gate's cause and exit; the record carries both
  the failing check and the hook's timeout.
- A stage whose `failure` hook cannot execute ends with the
  stage's own cause; the hook event says the hook could not
  execute.
- A `failure` hook interrupted by a signal still yields to the
  signal ending, as today (`gating.ts:34` guards `cause ===
  "signal"` on entry; the guard's meaning is unchanged).
- The specification states the rule. Everywhere the repository
  today says a `failure` hook's exit code changes nothing, it
  says the same of the hook's own breakage. Find those places by
  reading; this ticket does not list them, and the docs site on
  the unmerged `worktree-docs-and-cleanup` branch is not among
  them — work from what is on main.

This ticket exists because of the 2026-08-22 principles review
(three independent readers; two converged on this as the top
code-vs-principle disagreement).

## Priority raised to 8 (2026-08-22)

Filed at 6, promoted at 8, above everything else in this channel. The
reason is the second bullet above: a gate failure recorded as `fault`
is retried by the dispatcher instead of held, so the factory spends
attempts re-running work a check already rejected, and the ticket's
events never carry the real verdict. That is a live cost on every
flight, not a latent one.
