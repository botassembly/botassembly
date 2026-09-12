---
flow: build
priority: 7
---
# A gate can report an audited external blocker

When a gate is red because the MACHINE is broken — a required tool
missing, a service down, disk full — the run burns retries as though
the implementation were wrong, and the agent's only move is prose
nobody trusts. The repo's own issue
`sdlc/issues/no-legal-move-when-a-gate-is-red-for-an-out-of-scope-reason.md`
holds the same finding from the inside (this ticket deletes it); the
2026-08-10 outside review asked for the structured version: let the
GATE, not the model, report an external blocker.

## Behavior

- A gate can emit a structured external-blocker verdict alongside its
  red: machine-checked evidence (the gate's own output showing the
  external condition), never a bare agent claim. The design defines
  the verdict shape and which gates may use it, starting minimal.
- A run ending on an external blocker exits with a distinct cause on
  the published surface, evidence retained in the run record like any
  gate output.
- A model's unsupported statement cannot mint the verdict — the gate
  process itself writes it, sealed like every gate.

## Consumers

Queue settles bot causes by the complete cause/exit table (queue
0033), so a NEW cause is a contract change: queue ticket 0045 ("an
external blocker settles as blocked without an attempt"), filed at the
same time as this ticket, adds the settlement row. This ticket must
state the exact published cause string; 0045 consumes it. This ticket
lands first; the cause is inert until queue recognizes it, which is
safe (unknown pairs already settle as recorded faults).

## Tests you are authorized to restate

- Conformance/gate tests may be restated where they enumerate gate
  verdict shapes; additive elsewhere.

The src line ceiling may rise by at most 40 lines.
