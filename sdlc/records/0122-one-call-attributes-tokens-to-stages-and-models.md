---
base: 07e51e6bf6b8c713f59971c7c75c54569a5393ae
head: 29000e4f362b4f8060e5d4d4610b185417bcf376
---

`bot runs --usage --json` now reports each run's recorded turn tokens grouped
by stage, retry, provider, and model. The opt-in reading supports shared usage
selectors while ordinary `runs` output remains unchanged.
