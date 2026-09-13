---
flow: build
priority: 6
---
The mark tool should require a short evidence string when an agent
marks a checklist item done: one sentence naming the proof — the
command run and its observed result, the file path and symbol, the
test name and outcome. The evidence is recorded in the run record
alongside the item it marks.

Why: a mark today is a bare checkbox tick carrying no content. The
checklist is the mechanism that drives agent behavior, and a tick
proves only that the agent ticked. Evidence makes the mark cost what
the item costs — a specific file path or test count is hard to
invent and easy to audit — and when an operator dissects a failed
run, the record shows what the agent believed at each step, not just
that it clicked through. ("Ran the suite, 83 passed" where the suite
in fact failed is a visible lie; a bare tick is invisible.)

The behavior wanted: mark takes a required evidence argument; a mark
without it is rejected with a message saying what is missing; the
run record stores the evidence with the item. Vague evidence is not
policed by the runtime — "I checked" satisfies the mechanism; making
it satisfying to a reviewer is the checklist author's business, and
stage instructions may demand specificity. Send-back wording for
unmarked items is ticket 0004's territory and is not changed here.

Spec first: the mark tool's contract is specified behavior, so the
specification names the evidence argument before the runtime
requires it.
