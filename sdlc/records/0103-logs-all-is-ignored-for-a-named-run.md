---
base: 5f8fbed196c2bf78bad5c08fbab4ef53cf0b08f4
head: f48064de2d26d144681a6152ce369d35ab04ed6b
---

`bot logs RUN --all` now refuses rather than accepting an option that has no
effect. Help and invalid-request guidance explain that `--all` applies only
when no run prefix is named; bare `bot logs --all` keeps its existing behavior.
