---
flow: quickfix
priority: 4
---
# A relative BOT_HOME resolves before use

A relative `BOT_HOME` is used verbatim (`bot/src/invocation.ts:47`):
the home moves with the caller's working directory, and the
scratch keying that hashes the home path produces disjoint scratch
trees for what a person means as one home.

Done, observably: `BOT_HOME=./homes/x` resolves to one absolute
home at process entry, and every use — runs, scratch keying,
locks, the reading verbs — agrees on that one path from any
working directory; `--home DIR` already resolving relative paths
keeps its behavior.

From the 2026-08-19 review; this ticket carries the finding.

Named for restatement in `design:`/`design-review:` commits: none
expected — new cases land beside the existing invocation and home
tests.
