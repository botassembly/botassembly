---
flow: build
priority: 8
---
# A run holds a lock on the worktree it works in

A live `bot run` leaves no mark on the directory its agents are
editing. It locks its own run directory —
`<home>/runs/<run>.lock`, via `inspection.ts` — which proves a run
exists but says nothing about which working tree that run is
touching. Anyone standing in the worktree has no way to ask whether
a process is using it.

That gap has a consumer waiting on it. The sdlc factory's `prepare`
script reclaims a worktree when the claim commit's hostname matches
and the worktree HEAD matches the claim sha, and it force-deletes
the branch and the tree. If a dispatcher crashed while its `bot run`
child kept going, that child is still editing the tree when a new
flight reclaims it. sdlc ticket 0056 is the guard for that case and
it needs a liveness proof that actually exists. Its first flight
refused on 2026-08-11 for exactly this: the design probed a
worktree lock, and no producer takes one.

## Behavior

While a run is executing, it holds a lock on the working directory
its stages run in, and releases it when the run ends — including
when the run faults, refuses, or is killed, to whatever extent the
lock mechanism already in use provides.

Any process can ask whether that lock is held without taking it,
and can do so from a shell, because the consumer is a shell script
that is not permitted to import bot.

A stale lock left by a dead process does not read as live. The
existing run-directory locking already faces this problem and
solves it somehow; the design should reuse that answer rather than
invent a second one.

If a stage declares its own working directory (ticket 0017), the
lock follows the directory the stage actually runs in. If 0017 has
not landed, this is one lock for the run.

## Who consumes this and what they do next

sdlc ticket 0056 (`prepare` cannot bulldoze a live flight). Its
adoption step is to replace hostname-plus-sha with a query against
this lock. That ticket must not fly until this one is landed **and
deployed**, because its tests have to be green against the bot
runtime that is actually installed. Deploying the bot runtime is
itself gated by sdlc ticket 0058.

The lock's location and the exact query are this ticket's output
and 0056's input. Whatever shape they take, name them in the record
so 0056's author can write against a fact rather than a guess.

## What is not in scope

Killing an orphaned child, and deciding what should happen to a run
whose dispatcher died. Those belong to the queue side. This ticket
only makes the fact observable.

The src line ceiling may rise by at most 30 lines.

## Refusal addendum, 2026-08-11 (first flight)

The flight refused for traceability, and correctly. This ticket
requires the lock to be queryable from a shell; the design answered
with a new `worktree` command; and two shipped tests assert bot's
command inventory as a byte-exact sentence. The ticket named
neither. That is the ticket's fault.

## Tests you are authorized to restate

- `bot/tests/cli-logs.test.ts` — the assertion in "bot tools is an
  unknown command, named by the new verb list".
- `bot/tests/cli-request-invalid.test.ts` — the unknown-command
  assertion in "request-invalid — an unknown command, a command's
  argument shape, and an option given no value".

In both, **only the command list inside that one sentence** may
change, and only to insert the new verb. The sentence keeps its
exact shape, its `request-invalid  <command>` prefix, and its
trailing newline. Every other assertion in both files — argument
shapes, option-without-value handling, exit codes, and the empty
stdout on refusal — keeps its exact strength.

Follow the convention already in those files: both carry a
`// REDESIGN (ticket 0162): the list now names config and models
too.` comment beside the sentence. Add an equivalent line naming
this ticket. The pin is deliberately byte-exact because, as the
test's own comment says, the sentence has to keep naming the
commands or it stops telling the reader what to ask for instead —
so it is meant to be updated in the open, with a reason attached,
not quietly relaxed.

If the design's answer is not a new command after all, this
authorization simply goes unused. It permits a specific edit; it
does not require one.

## Refusal addendum, 2026-08-12 (second flight)

The second flight refused for the same class of gap, one file over,
and again correctly: the unknown-command guidance is shared, so
`bot/tests/cli-help.test.ts` asserts the same verb-list sentence the
two files above do, and the ticket did not name it. The flight's
edit was right in every particular — insert the verb, keep the
sentence's shape, add the `// REDESIGN (ticket 0022): ...` line —
and the reviewer reverted it only because this ticket failed to
authorize it. The flight's work is preserved as
`orphan/0022-refused-work`; treat it as prior art on the same terms
as any other.

So, additionally authorized in `bot/tests/cli-help.test.ts`, under
the same discipline as above:

- The unknown-command sentence in "usage errors stay earned": only
  the command list inside that one sentence may change, only to
  insert the new verb, keeping the sentence's exact shape and the
  refusal-names-every-overview-word order, with a `// REDESIGN
  (ticket 0022): ...` line beside it.
- The `COMMANDS` list at the top of the file, and with it the
  overview and per-command `--help` assertions that iterate it:
  the new verb may be inserted there, in the overview's position,
  so the command carries the same one-plain-screen `--help`
  contract as every other verb. The parity the file's own comments
  pin — the refusal names every word the overview does, in the
  overview's order — must hold after the change; a verb that
  appears in the refusal but not the overview is wrong.

Every other assertion in the file keeps its exact strength. And as
above: if the design's answer is not a new command, all of this
goes unused.

## Consumer constraint, 2026-08-12 (fold into design)

A live consumer's handoff adds one requirement: the
liveness predicate must not assume one run per worktree. Same-
worktree concurrency is a supported pattern for them, so an
exclusive one-run lock would conflict with real usage. What the
factory cleanup consumer needs is a shell-visible answer to "is
any live run using this directory" — multiple concurrent holders
must be expressible, and the stale-lock rule applies per holder.
This narrows the design space; it does not change the behavior
section's contract.
