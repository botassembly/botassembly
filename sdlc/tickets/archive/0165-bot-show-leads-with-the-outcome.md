---
flow: build
priority: 4
---
# Bot show leads with the outcome

`bot show` prints the record event by event and deliberately
closes with the spend summary, so the answer to "what happened" is
at the bottom of a listing that can run to hundreds of lines — a
3.4M-token run must be read whole to learn its outcome. Half of
those lines are a `provider_transport websocket, requested` entry
repeated before every single turn. ADR 0022 sets the rendering
bar; this ticket applies it to the deepest-read verb.

Done, observably:

- `bot show` opens with a summary block: the run's outcome, flow
  and assembly, wall time, each stage with its verdict and token
  spend, the total spend, and — for a run that ended badly — the
  terminating error text whole. The event log follows.
- Consecutive repeated transport events collapse into one line
  with a count (`provider_transport websocket, requested ×41`);
  any transport line that differs from its neighbor still prints
  itself.
- Turn lines render their token fields humanized and aligned per
  ADR 0022; identifiers and stop reasons stay verbatim.
- `--json` is untouched: it remains the record's own JSONL lines,
  and a test pins it byte-stable across the change.

Boundary: rendering only. No event is dropped from the log — the
collapse is a display of identical neighbors, and the record on
disk is never rewritten.
