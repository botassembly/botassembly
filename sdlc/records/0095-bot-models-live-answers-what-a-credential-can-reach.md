---
base: 2d8380de1d868bf7b774866fbceaeffa8096120c
head: 30994a9596da03e4c00bcf3aed955eadccfd800b
---

Landed `bot models --live [provider]`, which refreshes configured catalogs and
compares them with bot's pinned list. Differing rows identify live-only and
pinned-only models, while ordinary listings remain offline and a missing named
credential is refused plainly.
