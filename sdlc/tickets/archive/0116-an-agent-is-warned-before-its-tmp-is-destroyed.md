---
flow: build
priority: 8
---
# An agent is warned before its tmp is destroyed

Ticket 0114 makes every tmp slot die with its scope. Deletion is
safe for bytes and unsafe for exactly one thing: evidence an agent
parked in tmp meaning to use it — a captured log, a diff, a
measurement. No machinery can tell a 6.6G build tree from a 6K
file the whole stage hinged on. Only the agent knows, and only
before it exits. Ian's ruling, 2026-08-21: the warning exists to
prevent loss, not to tidy disk — and it belongs here, in the
runtime, because every agent in every assembly has a tmp slot,
whatever its project is about.

Done, observably: an agent that tries to finish its stage while
its tmp slot is non-empty is not stopped, but its first attempt to
finish is answered with a warning instead of an exit: this
directory is destroyed when your work here ends; here is what it
holds, largest first; anything you still need must move to a
durable home first — your output document if it is part of your
account, or the working directory you were given if a later stage
needs it; when nothing left here matters, use `clean-temp`, or
finish anyway. A `clean-temp` control tool, alongside `mark` and
`refuse`, empties the slot — using it is the agent's explicit
confirmation that everything remaining was disposable. An agent
warned once may finish on its next attempt regardless of the
slot's state: the warning is a chance to decide, never a wall. An
agent whose tmp is already empty is never interrupted at all.

The warning must never delete anything itself — an automatic sweep
is precisely the silent loss it exists to prevent — and it names
the durable homes, because an agent told only to clean up will
delete the evidence along with the garbage.

The hard choice to settle, and say why: where the interception
lives — in the stage-completion path of the runtime, or as a
runtime-provided gate every stage carries implicitly. It must hold
for every assembly without any assembly opting in, must not fire
for control-tool exits that are not completions (a refusal is not
the moment to nag an agent about files), and must add nothing to
the path of a stage that leaves its tmp empty.

## The warning spends no retries

One constraint the "never a wall" promise above depends on, stated
separately because the surrounding code makes it easy to lose.

The runtime already has the shape this warning wants. Each stage
loop in `bot/src/gating.ts` checks whether the agent ended, and when
a condition is unmet it builds `feedback`, calls `recordCheck` and
`nextAttempt`, and re-prompts with `sendBackPrompt`. Reusing that
path is the obvious design and probably the right one. Every one of
those loops also carries this line:

    if (sends >= config.retries) return finish(input, { exit: 1, cause: "exhausted", ... })

A warning delivered through the shared retry budget can therefore
end a stage as `exhausted` — a failed stage, an attempt spent, over
leftover files. That is the opposite of what this ticket is for, and
it would be reached by an agent doing nothing worse than ignoring a
notice about a directory that was never durable.

So: the tmp warning does not consume a stage's retries, and can
never by itself be the reason a stage ends. It interrupts at most
once per stage, and the attempt that follows it completes on the
agent's terms whatever the slot holds. If the design finds the
existing sendback path cannot deliver a message without spending a
retry, then the message travels another way — the constraint wins
over the convenience.

Nothing here changes what the retry budget means for the checks that
legitimately own it: a schema failure, a gate failure, or an
unanswered question still exhausts a stage exactly as it does today.
