---
flow: quickfix
priority: 5
---
# The subflow context cap is measured in bytes

`contextContent` (`bot/src/subflow-runtime.ts:85`) caps an
oversized child output by slicing the first 100 lines, but the
threshold that triggers the cap is 10,000 characters. A child that
seals a multi-megabyte single-line output — one JSON object, say —
has fewer than 100 lines, so the whole payload lands in the parent
agent's tool result and context window, which is exactly what the
cap exists to protect.

Done, observably: a child output over the threshold is truncated
to a bounded number of bytes whatever its line count, with a
marker saying it was cut; the tool result still names the output's
full size and path for an agent that wants the rest.

This ticket exists because of
`sdlc/issues/0060-the-subflow-output-cap-counts-lines-not-bytes.md`.

Named for restatement in `design:`/`design-review:` commits: none
expected — new cases land beside the existing subflow tests; if a
shipped assertion pins the line-sliced shape, name it in an
addendum before restating.
