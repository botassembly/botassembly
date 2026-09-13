# The third public example

`vtriage` covered skills, checks, hooks, and `CHOOSE`. `digest` covered `PARALLEL`, `FANOUT`,
and a bounded `LOOP`. This branch covers what neither reached: `DESCEND`, a subflow an agent
calls as a tool rather than a container calling it, more than one skill in the slot, a
`schema.md` template, and a loop that exits early.

## What landed

`examples/outline` turns a rough pile of notes into a structured outline. `01-scope` writes a
markdown plan whose frontmatter `schema.md` validates, `02-expand` calls a `DESCEND` subflow
once per section and that flow calls itself per subsection, `03-review` loops on the body with
a rubric gate inside it, and `04-emit` hands the result out. `bot check ./examples/outline/plan`
resolves in five lines and exits 0.

## Decisions

**The descend flow sits in the stage folder, not the flow folder or the root.** `02-expand` is
the only stage with any business calling it. The second example's note already recorded what an
assembly-root subflow costs: it is a tool on every stage, and a later stage called the fan-out's
worker three more times on its own. Stage scope is the narrowest grant that works, and
`bot check` resolves it there — empty the folder and it exits 2 with `folder-empty`. Reversible:
widen it if a second stage ever needs to expand a section.

**One thing carries two of the five bullets.** The descend subflow is both the `DESCEND` and the
subflow an agent calls as a tool. Adding a second, ordinary subflow purely to separate them would
have added a folder that taught nothing the first one does not. The README says which piece is
doing which job.

**The two skills sit at two scopes.** `outline-style` at the assembly root because the descend
flow writes headings too; `section-rubric` in the review stage's folder because only that stage
reviews. Both flatten into one `$SKILLS` list, so the review stage's prompt index shows two
skills and says nothing about where either came from. Putting both at one scope would have shown
the index without showing the flattening.

**The heading level travels in the call's input.** A descend flow's stage cannot know how deep it
is; the runtime tells the record, not the agent. The parent hands each child the level to write
at. This is the honest fix and it is what an author would write.

**A gate for what a script can catch, the loop's body for the rest.** `01-rubric` checks the
title, the section count, the nesting depth, and two bullets per leaf section. The rubric's
remaining items — no bullet repeating another, every open question accounted for — are judgement,
and the loop's question is where judgement belongs. The gate clears before the question is asked.

**`repeat: 4`.** A loop with a body fails with `rejected` when it runs out, so the ceiling is a
budget. Four leaves room for the outline to be wrong twice and still finish.

**No run proof.** The README pastes `bot check` only, taken with the throwaway home
`sdlc/scripts/examples` writes. Running it calls a model once per section and again per
subsection. A record excerpt belongs to the live smoke ladder, the way both earlier notes left it.

## Where the specification and `bot check` disagreed

One, filed as `sdlc/issues/2026-09-11-max-depth-above-ten-is-accepted-and-unreachable.md`.
`max-depth` is validated as an integer of at least 1 with no maximum, while the runtime empties
the subflow scope at a call-chain depth of ten. `max-depth: 99` resolves and exits 0 and can
never mean what it says. The refusal for a bad value names no bound either, where `width`'s does.
The example writes `max-depth: 3` and is unaffected.

Everything else the specification claims, `bot check` enforced. `DESCEND.md` without `max-depth`
is `key-missing`. `DESCEND.md` beside `FLOW.md` is `sentinel-duplicate`. A loop last in the
sequence is `tail-container`. A `DESCEND` flow in `flows/` resolves as an entry flow, as the
specification says it may.

## Left open

- The proof still shows only the entry flow's root stages, so the descent itself is invisible to
  it. Filed already as `sdlc/issues/2026-09-11-bot-check-does-not-list-subflow-stages.md`, and it
  bites hardest here: an example about self-calls proves five lines that contain no self-call.
- Nothing proves this example still produces an outline. The gap all three examples share.
