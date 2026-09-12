---
flow: build
priority: 7
---
# The inspection verbs speak JSON

The deck is growing pages that render what this home holds: a
runs list with facets, a dashboard with per-project disk weight,
a prune report. The deck reads run directories only through
bot's own readers (its ADR 0005), and today three readers have
no machine face: `bot runs`, `bot status`, and `bot prune` are
human-only.

Each gains `--json`: one JSON document on stdout carrying the
same facts the human output carries, from the same single
gathering — never two collections that can disagree. The
document carries a `schemaVersion`, because a consumer will
render it. Human output does not change; exit codes do not
change. For `prune`, `--json` composes with the existing
selection flags and reports exactly what the human report
reports — what would go, what is refused and why, run-less
locks — and `--delete` still removes nothing it did not list.

Named for restatement in `design:`/`design-review:` commits:
`bot/tests/cli-help.test.ts` and `bot/tests/cli-help-facts.test.ts`
(the help text grows the flag), and
`bot/tests/inspection-conformance.test.ts` where it pins these
commands' output shapes. The JSON documents themselves are new
surface: their assertions, once written, are consumer contract
and may only grow.
