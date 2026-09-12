---
flow: build
priority: 7
---
When a gate fails and the stage has retries left, the agent
receives the gate's output verbatim and nothing else —
`sendBackPrompt` (bot/src/prompt.ts:108) returns the raw feedback
bytes, and gating.ts:170 sends them as the whole turn. There is no
statement that a gate failed, no ask, no way out.

Observed live (biomcp ticket 0875, 2026-08-08): the lint gate
failed for an environment reason, the agent got the bare lint
output, replied in 7 seconds with no tool calls by re-emitting its
earlier summary, and did it again — two retries producing
byte-identical output before the run exhausted. The paste reads as
information, not as a request to act.

The behavior wanted: a gate-failure send-back frames the paste with
what happened and what is asked, along the lines of: the named
check failed, its output follows, fix the cause and commit, then
rewrite your output; if the cause is outside the ticket's scope,
say so plainly instead of retrying. The gate output itself stays
verbatim and unabridged.

The exact wording is the design's to choose, under one constraint a
first attempt tripped over: the send-back is agent-facing text, and
the runtime-prompt-disclosure test forbids internal vocabulary
(`stage`, `stages`) in it. A frame containing "rewrite the stage
output" cannot pass that test, and the disclosure assertion must
not be weakened to admit it — say "your output" or equivalent. The
first flight refused for exactly this contradiction, correctly.

This is the same defect family as ticket 0004 (checklist send-backs
name the required action), which explicitly left gate-failure
send-backs alone. Same shape of fix, different message.

Spec first: send-back wording is specified behavior, so the
specification names the framing before the runtime emits it. Tests
pinning the current bare-paste behavior are part of what this
ticket changes; updating their assertions is authorized — do not
delete or weaken them.

Note the "say so plainly" clause is advisory until the stage
contract gives that statement mechanical effect; the issue
"no-legal-move-when-a-gate-is-red-for-an-out-of-scope-reason"
tracks that separately. Framing alone still ends the
identical-retry waste, which is this ticket's whole scope.
