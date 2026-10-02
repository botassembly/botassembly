# Reevaluate botassembly against ThinkThen

Status: Open

Ian dictated this on 2026-10-02. He paused botassembly work in mid-September to start ThinkThen. He now wants the whole of botassembly reevaluated. Nothing here is a ruling yet.

## The two questions

1. Can ThinkThen serve as a command-line tool that agents call to do their work? A stage's agent would run ThinkThen's functions, such as decide, choose, rank, filter and score, the way it runs any other command.
2. Can ThinkThen become a new way to control gating and the control graph around loops? Today a stage's own agent decides done, loop and choose. ThinkThen would make those decisions from outside the agent.

The answers may change what botassembly is. They may also leave the specification and runtime as they stand, with ThinkThen as one more tool.

## What the reevaluation reads

- `sdlc/planning/plan.md` and `sdlc/planning/decisions/2026-09-24-restart-rulings.md` for where the project stopped.
- `2026-09-18-no-outside-decider-for-done-loop-or-choose.md`, `2026-09-20-thinkthen-as-the-judgment-inside-a-stage.md`, `2026-09-21-what-botassembly-owes-the-judgment.md` and `2026-09-24-thinkthen-tracks-audit-and-diff-for-graded-runs.md` in this folder.
- `sdlc/planning/jev-in-botassembly.md`, `sdlc/planning/decider-study.md` and `sdlc/planning/decider-models-report.md`. The restart rulings make their numbers provisional.
- ADRs 0001, 0002, 0006, 0007, 0019 and 0030 for the Pi boundary, the session file and gating as a prompt-round loop.

## Work held behind it

- Ticket 0303, the release ticket, already waits on the run-record change in the 2026-09-21 issue.
- The Pi 1.0 upgrade request in the botassembly inbox. Pi 1.0 removed the agent harness and session storage Bot uses. Its Code Mode can call classifier models from inside a script. Whether Bot upgrades, and how, depends on the answer to question 2.
- Other agent-tooling work paused at the same time. Each piece resumes, merges into ThinkThen, or closes once the reevaluation lands.

## What it produces

A written assessment in `sdlc/planning/` that answers both questions with evidence. It recommends what botassembly keeps, what moves to ThinkThen, and what closes. Ian rules on it. The rulings then become ADRs, tickets, or closed issues.
