---
flow: build
priority: 7
---
When a stage ends with checklist items unmarked, the send-back
message the agent receives is today just the bare item text, for
example:

    6. Everything committed with `quickfix:` messages, `git status` clean

Observed live (run 2026-08-07T21-57-05-8166): an agent whose work
was correct and committed read that as a question, answered twice in
prose ("Confirmed — the tree is clean"), never called the mark tool,
and exhausted the stage. The work died on etiquette.

The behavior wanted: an unmarked-checklist send-back states the
required action alongside the item — that the item is unmarked, and
that if it is done the agent must mark it with the mark tool,
because prose does not count. One or two added sentences in the
send-back text; the checklist mechanics themselves do not change.
A gate-failure send-back (a gate script's stderr) is a different
message and stays as it is.

Spec first: the send-back wording is specified behavior, so the
specification names the new wording before the runtime emits it.

Existing tests that pin the old wording are part of the behavior this
ticket changes, and updating their assertions is authorized — named
so a design pass need not refuse: bot/tests/cli-checklist-schema-sendbacks.test.ts
asserts the bare numbered item text today, and its assertions should
be updated to the new wording, not deleted or weakened. (A prior
flight, run 2026-08-07T23-03-44-e3f6, correctly refused for exactly
this omission.)
