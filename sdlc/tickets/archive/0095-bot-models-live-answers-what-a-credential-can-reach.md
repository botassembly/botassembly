---
flow: build
priority: 5
---
# `bot models --live` answers what a credential can actually reach

`bot models` reads the pinned library's catalog narrowed to the
providers bot holds a credential for (`bot/src/catalog.ts`), and its
help says out loud that the listing is as current as bot is. That is
the right offline answer and this ticket does not change it.

What no command answers is the admin's question: what does this
credential reach *today*? The pi library bot pins carries a
list-models capability that asks the provider itself. When a provider
ships a model the pin does not know, or retires one it does, the
operator discovers it by a run failing — the same discover-by-failing
path the documentation review of 2026-08-20 flagged for model names
generally (`sdlc/planning/spec-consolidation-report-2026-08-20.md`
era; three fresh-reader reviews, all three asked "which models can I
actually call?").

Done, observably: `bot models --live [provider]` asks the provider
through the pinned library and prints the same columns as the offline
listing, marking rows that differ from the pin (present live but not
pinned, pinned but not offered). Without `--live` nothing reaches the
network, exactly as today. The refusal for a provider bot holds no
credential for names the fact plainly. A boundary test fakes the
provider listing; no test calls a network.

Budget: 80 net src lines.
