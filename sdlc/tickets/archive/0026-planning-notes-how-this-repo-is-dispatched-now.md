---
flow: quickfix
priority: 11
---
# A note records how this repo is dispatched now

This repo participates in a work factory, and how it participates
changed today: the factory CLI (from the factory repo) dispatches it
through the five lifecycle scripts in `sdlc/project/` — tasks,
before, success, failure, health — replacing the old queue/sdlc
runner and its `sdlc/scripts/` set.

## What done looks like

One short dated note at `planning/notes/factory-dispatch.md` (or the
repo's existing planning notes location if it differs) stating: what
dispatches this repo, through which scripts, and that
`sdlc/scripts/` is the retired old set kept only until its removal
ticket. A few sentences, present tense, true.

Do not touch code, the specification, guides, or `sdlc/scripts/`.
