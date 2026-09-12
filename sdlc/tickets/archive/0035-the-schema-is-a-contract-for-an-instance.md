---
flow: build
priority: 8
---
# The schema is a contract for an instance

A consumer project's first day (notes reference: two runs died at
`additionalProperties: false` because the output carried
`$schema`, `title`, and `type` — keys the agent copied from the
schema it had just been shown; a full stage burned all three
attempts on three meaningless keys).

The prompt (bot/src/prompt.ts, "Write JSON matching this
schema") hands the agent the schema document verbatim and never
says the output is an instance. Two changes, both to rendering —
validation does not weaken:

1. Do not render `$schema`, `$id`, `title`, or `$comment` into
   the prompt at all. They describe the schema document, not the
   instance's shape; they are exactly the keys agents echo.
   Every other keyword renders as today.
2. Frame the ask explicitly: write an instance of this schema;
   do not copy schema keywords into the output.

Named for restatement in `design:`/`design-review:` commits:
`bot/tests/prompt.test.ts` and the golden prompt transcripts
under `bot/tests/golden/` (`*.system.txt`, `*.user.txt`) may be
restated to the new rendering;
`bot/tests/runtime-prompt-disclosure.test.ts` and
`bot/tests/runtime-prompt-announcement.test.ts` likewise if they
quote the rendered schema text. Assertion strength holds: the
same schemas render, minus the four document-description keys,
plus the instance framing.

The consumer dropped `additionalProperties: false` at the top level
of their artifact schemas to survive; they will restore it once
this lands, so the fix must be provably enough on its own.
