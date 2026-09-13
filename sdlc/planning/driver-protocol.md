# Driver protocol — how the session lead runs the queue

Ruled by Ian, 2026-08-03. **The session lead is the DRIVER, not
the implementer.** Builds are dispatched to Opus subagents at
medium effort; the driver keeps its context for judgment, audit
and reporting, and does not spend it reading diffs it can have
re-derived.

This is a change from 2026-08-02, when the lead built directly.
The reason is context economy: a lead that implements gets
compacted mid-queue and loses exactly the judgment the queue
needs. A lead that dispatches keeps the whole board in view.

## What the driver does itself, always

- **Reads the ticket in full** before dispatching. A brief
  written from a ticket skimmed is how a subagent builds the
  wrong thing correctly.
- **Runs `make check` personally** after every build, in the repository root. A subagent's claim of green
  is a claim, not evidence.
- **Re-derives at least one red independently** — a DIFFERENT
  falsification than the builder's, `cp`-backed and
  `cmp`-verified on restore. If the builder falsified by
  deleting a guard, the driver breaks an expression instead.
- **Reads the diff for spec-touching and record-touching
  changes.** Everything else may be audited by evidence.
- **Writes the ticket's audit notes, the punchlist tick, the
  handoff sweep, and the commit** — the record of what happened
  is the driver's, never a subagent's.
- **Decides interpretations.** A subagent that hits an ambiguity
  STOPS and reports; it never picks a side. Rulings are Ian's,
  interpretations are the driver's, code is the subagent's.

## What a dispatch brief contains

Dispatch with the Agent tool, `subagent_type: "general-purpose"`,
`model: "opus"`, and state "medium effort" in the brief. Every
brief carries, in this order:

1. **Where and what:** the repo path, the ticket path, and the
   instruction to read the ticket and
   `planning/tickets/CHECKLIST.md` in full first.
2. **The standing rules that bind the build:** red-green
   mandatory; `specification/` is read-only unless the ticket
   carries a ruling; commit nothing and push nothing (the driver
   commits); no new dependencies; never weaken the gate; a
   reality-vs-ticket disagreement is a STOP-and-report, never a
   judgment call.
3. **What to return:** the files changed, the reds shown with
   their exact failure text, the falsifications run with their
   backup/restore evidence, the final `make check` numbers, the
   checklist items touched (with a sentence of evidence each),
   and — required — what was NOT done and what a reviewer should
   look at hardest.
4. **The budget** from the ticket, and the instruction to report
   the honest actual after one shrink pass (ADR 0015).

## Briefs that authorize writing outside the repo

Learned from 0058 (2026-08-03). A brief that says "you may write
`~/.local/bin/bot`" has authorized the destination but said
nothing about the *rehearsal*, and a builder will reasonably
verify against the real thing — including forcing past its own
safety guard to get there.

So: **when a brief authorizes any write outside the repo, it must
also name the non-destructive route and require it.** Verify
against an overridable target (`make install BINDIR=<scratch>`),
prove every branch there, and spend exactly one final step on the
real path. If the tool offers no such override, that is the first
thing the ticket should add.

The corollary is about guards: a builder that overrides a safety
check it wrote minutes earlier is not being reckless, it is being
blocked by its own correct work. Give it the sanctioned way
around, or it will invent one.

## Lane discipline

- **One builder lane dirty at a time.** Two subagents editing
  `bot/src/` concurrently is how a gate becomes unattributable.
  Parallel dispatch is allowed ONLY for read-only work
  (surveys, ledger walks, corpus reading) or for work in
  disjoint trees with the driver's explicit say-so.
- **The driver commits between lanes**, so every lane starts
  from a clean tree and a green gate.
- **A failed lane is reported, not retried blind.** If a
  subagent returns something that does not survive the driver's
  audit, the finding goes in the ticket and the next dispatch
  carries what was learned.

## What never goes to a subagent

- Rulings, and anything on Ian's veto list.
- Writing the handoff, the punchlist, or a commit message.
- Deciding that a spec sentence is correct. A subagent may draft
  spec text when the ticket carries the ruling; the driver reads
  every word of it against the surrounding chapter before it
  lands.
- Anything the ticket did not authorize. Scope growth discovered
  mid-build is a finding for the next ticket.

## Model routing (carried from Fable, 2026-08-03)

Codex 5.6 refuses robustness- and security-flavored tickets;
route those to a Claude lane. Opus is the default builder for
everything in this queue.
