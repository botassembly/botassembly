---
flow: build
priority: 5
deps: ["0093"]
---
# The nearest flow's body speaks for a descendant-flow stage

Ticket 0093 makes a `FLOW.md` body part of every stage's prompt and
proves it for a flat flow; its `## Deferred proofs` section defers
the descendant-flow position to this ticket. When flows nest, two
bodies could plausibly claim a stage's prompt — the subflow's own
and its ancestors' — and 0093 does not answer which.

The ruling this ticket carries: a stage's prompt includes the body
of its nearest enclosing flow only. A subflow is its own procedure;
its body is the description of that procedure, and an ancestor's
body describes a different one. Ancestor bodies do not cascade
down. A subflow with an empty body adds nothing — the ancestor's
body does not leak in to fill the silence.

Done, observably: for a stage running inside a descendant flow, the
prompt carries the descendant flow's body and position statement
and provably does not carry any ancestor flow's body; when the
descendant's body is empty, the prompt carries no flow body at all.
Both are witnessed at the prompt itself, the same way 0093
witnesses the flat case.
