---
base: a331dd7c914733165a8976f9de7bd2bc625d0ee4
head: e0da550e09fd8b2d5da5d83e9800ffb63f5c76f0
---

Landed `$BOT_RUN_ID` for every agent, gate, and hook, derived from its owning run directory basename and overriding caller values.

The specification now defines the environment contract without exposing a run path, and end-to-end coverage includes hooks, gates, caller spoofing, and nested subflows.
