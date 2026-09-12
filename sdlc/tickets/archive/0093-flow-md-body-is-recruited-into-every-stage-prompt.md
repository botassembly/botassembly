---
flow: build
priority: 5
---
# `FLOW.md`'s body is recruited into every stage's prompt

The specification says a `FLOW.md`'s body stays empty, and nothing
enforces it: `parseFlow` (`bot/src/graph.ts:358`) reads only
frontmatter, so prose in the body parses silently and goes nowhere —
the single unwitnessed rule the 2026-08-20 consolidation found
(`sdlc/planning/spec-consolidation-report-2026-08-20.md`).

The ruling is neither of the two fixes that ticket draft first
offered. An author who writes prose in a file expects it to be read,
and the flow's body is the natural home for the one thing no stage
can say about itself: what the whole procedure is. The least
surprising behavior is that the body becomes flow-level context.

Done, observably: a `FLOW.md` body, when present, is included in the
prompt of every stage in that flow, alongside which stage of how
many the agent is running — so each fresh context knows the
procedure and its own place in it. An empty body stays valid and
changes nothing. The specification element `flow.md` rewrites its
"empty body" section to say what the body is for and that it should
describe the procedure, not instruct any one stage; a conformance
accept case carries a `FLOW.md` with a body; a boundary test
witnesses the body's text reaching a stage prompt.

Budget: 80 net src lines.

## Deferred proofs

Added 2026-08-21, after three design-review refusals for deferrals
that named no successors. The design may leave these positions
unproved; each is carried by the named successor ticket, filed and
sequenced behind this one via `deps`:

- container position — ticket 0110
- parallel position — ticket 0110
- choice position — ticket 0110
- loop position — ticket 0110
- descendant-flow position — ticket 0111 (which also settles that
  only the nearest enclosing flow's body speaks; ancestors never
  cascade)

The core behavior this ticket still proves itself: the body reaches
every stage prompt of a flat flow, with a truthful statement of
position, and an empty body stays valid and adds nothing.
