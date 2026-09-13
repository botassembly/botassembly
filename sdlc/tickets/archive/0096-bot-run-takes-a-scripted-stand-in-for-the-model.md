---
flow: build
priority: 5
---
# `bot run` takes a scripted stand-in for the model

An author testing an assembly today has two speeds: `bot check`,
which is free and says nothing about behavior, and `bot run`, which
spends real money on a real model. There is nothing between — no way
to watch a flow's gates, hooks, containers, and record land without
paying for the agent in the middle.

The machinery already exists and is test-only: the boundary harness
injects a faux provider so `bot run` can be driven end to end with
no network (`bot/tests/cli-boundary.ts`), and the whole gating suite
rides it. What no author can do is reach that seam from the CLI.

Done, observably: a deliberate flag (spelling for the implementer to
propose — the word must not look like a provider name an assembly
could carry) makes `bot run` drive every agent round from a script
or canned transcript the caller supplies, with the record honestly
naming the stand-in in its provenance so a dry run can never pass as
a live one. The refusal for using it without a script names what to
supply. A test proves a two-stage flow with a gate runs green under
the stand-in and that its record says so.

Budget: 120 net src lines.
