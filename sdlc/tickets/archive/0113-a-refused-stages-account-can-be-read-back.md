---
flow: build
priority: 6
---
# A refused stage's account can be read back

When a stage refuses, its own account of why is the hardest thing in
the run to retrieve. `bot output <run> <stage>` answers "this run has
no sealed output for stage 03-code", because the stage wrote its
document and then refused, so nothing judged it and it never sealed.
The reasoning is on disk — the stage_end event says "wrote
stages/03-code/1/1/output.txt, nothing judged it" — and there is no
verb that hands it back.

What is left is the refusal sentence, which travels as the run's
reason and reaches the factory's event log. That sentence is written
to be short. Diagnosing why a ticket is stuck then means reading
`bot show` and squinting at tool-call lines cut off at their first
hundred characters.

This is exactly backwards. A stage that succeeded has its output one
command away; a stage that failed, which is the only kind anyone
needs to read, does not. On 2026-08-21 three tickets were blocked at
once — biomcp 1032, botassembly 0101, factory 0050 — and each
diagnosis had to be assembled from truncated event text rather than
read from the document the agent wrote.

Done, observably: a reader can retrieve the document a refused stage
wrote, named the same way a sealed output is named, and the answer
says plainly that these bytes were never judged — so nobody mistakes
an unjudged draft for a sealed record. A sealed output's behavior
does not change, and a stage that wrote nothing still says so.

The hard choice to settle: whether this is the existing output verb
learning to hand back unjudged bytes with that warning attached, or a
separate verb so that "output" keeps meaning "sealed and judged". The
record's promise is that a sealed document was checked; nothing in
this ticket may weaken that. Say which was chosen and why.
