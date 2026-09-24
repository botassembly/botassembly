# Rulings for the Botassembly restart

Ruled by Ian on 2026-09-24 by dictation. Recorded the same day by the Claude session he asked to record them. [ADR 0031](../adr/0031-the-specification-is-the-smallest-contract-every-runtime-keeps.md) holds his spec-versus-runtime ruling.

## The run record changes before 0.1.0

Any change to the run record lands before `0.1.0` ships. Item 1 of `sdlc/issues/2026-09-21-what-botassembly-owes-the-judgment.md` is such a change. The runtime places the evidence a gate's judgment read inside the stage attempt directory and names it in a record event. Ticket 0303 therefore waits for that change.

The release rule in `sdlc/planning/plan.md` also stands as written. A release ticket proceeds only when the issues folder carries no work. Each other open item must still be closed, promoted, or explicitly deferred before release. This record defers nothing.

## Optimizer stays a Botassembly process

Optimizer is not part of ThinkThen. Optimizer is a Botassembly-specific process. It edits an assembly folder: its stages, skills, and prompts. ThinkThen supports it. A question file ThinkThen answers is one thing Optimizer may tune.

## The decider experiments are provisional

Experiments b01, b03, and b07 ran on 2026-09-18. They predate what Ian now knows about ThinkThen and TypeSafe's Jev model. Their conclusions are provisional. That covers the finding that a judge shown the agent's claims turns agreeable. It also covers the finding that judging a whole stage as done measured badly. The count of zero choose and loop events in the sealed records is an observation and stays.

Bounded new experiments must replace them before any ruling rests on their numbers. ThinkThen's new `recognize` and `relate` functions tag spans of text in a BILU style. They are a candidate building block for agents and belong in those experiments. `sdlc/planning/decider-study.md` stays a study, and its numbers carry the same caution.

## Context for this repository

- The work queue keeps running software work through SDLC. What it runs next is undecided.
- The first domain agent is undecided.

## What Ian can overturn

The rulings are his. The release-rule reading is the recorder's. Ian can declare the other open items non-blocking for `0.1.0`.
