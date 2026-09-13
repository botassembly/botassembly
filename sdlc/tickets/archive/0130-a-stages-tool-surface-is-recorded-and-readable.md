---
flow: build
priority: 5
---
# A stage's tool surface is recorded and readable

The record captures every tool *call* a stage made, but never the
composed tool surface it was offered — no event names the tools the
model could have called. The harness-contract standard (deck's
coverage doc, `repos/deck/sdlc/planning/harness-contract-coverage.md`)
counts the action surface as a first-class artifact: the same stage
file with different tools is a different agent, and nothing on this
machine can show the difference after the fact.

Done looks like: for any stage attempt in any run, a reader answers
"which tools could the model call, with what descriptions" — from
the record or the run's artifacts, without re-deriving it from the
harness source. The runtime knows the composed surface at dispatch
time; recording it once where the attempt begins is the natural
shape, and reading it joins the existing inspection verbs (`show`,
`session`) rather than a new one.

Hard choices, settled: the surface is names and descriptions, not
full JSON schemas re-embedded — the schemas live with the harness
version, which the record already names, and duplicating them per
stage multiplies bytes for near-zero reading value; old runs simply
predate the recording and say so rather than backfilling anything;
the default text outputs of existing verbs do not change — the new
facts ride the `--json` readings.

Consumer: deck's run page (their ticket, gated behind this); any
agent asking "what could this stage do" — same question, CLI first.
