---
flow: build
priority: 5
---
# Prune accounts for its own totals

A prune report is a list of rows with byte counts and no sum. On
2026-08-21 an operator answering "how much is reclaimable?" wrapped
the command in `du` and `df` before and after, then summed twenty
rows by hand — for a question the tool had already computed the
answer to. The delete form has the same silence: it prints each row
`removed` and never says what the sweep freed.

Done, observably: a prune report ends with a summary line — how
many entries, how many bytes, would-remove or removed as the mode
dictates — and a `--delete` run's summary states the total it
freed. An empty report keeps saying "Nothing to prune." The `--json`
report carries the same totals as fields. Rows keep their exact
current shape, so nothing parsing them today breaks; the summary is
one added line, not a reformat.
