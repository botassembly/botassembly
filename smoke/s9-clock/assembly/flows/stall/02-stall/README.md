# Why this stage cannot finish

`timeout: 1` is one second, the smallest value the format accepts
(`invocation.md`: "`timeout` is at least 1"). One second is less than a single
round trip to a real provider, and the instruction above needs three of them, so
the agent's clock ends this stage before its first turn can settle — whatever
the model does, however fast it is.

That is deliberate, and it is the doctrine ticket 0141 was written under: force
failure only through deterministic components — gates, hooks and clocks — never
through a mistake the fixture hopes the model will make. The clock is the
component here. The three round trips are the belt to its braces: even a
provider that answered inside a second could not answer three times inside one.

Nothing tells the agent about the timeout, and nothing should: what a stage is
allowed to cost is the runtime's business and never the agent's (invariant 4).
This file is inert — a README is inert in every folder — so it reaches no
prompt, and the sentence above stays true with it sitting here.
