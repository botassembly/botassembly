---
flow: build
priority: 4
---
# README uses the workspace handoff convention

Botassembly's SDLC README introduced `sdlc/planning/handoffs/YYYY-MM-DD-topic.md`, while the workspace handoff skill and existing Doctor rule use `sdlc/planning/notes/handoff-YYYY-MM-DD.md`. Ian chose the existing workspace convention on 2026-08-27.

## Done, observably

- The README names `sdlc/planning/notes/handoff-YYYY-MM-DD.md` as the one session-handoff location and repeats the read-act-delete rule.
- It no longer advertises `planning/handoffs/` or topic-specific handoff names.
- The workspace handoff skill remains unchanged.

## Boundary

Documentation only. Do not change Bot behavior, Factory Doctor, the workspace skill, or unrelated planning-folder descriptions.
