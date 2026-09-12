---
base: 4af06d3f993f237bd073a97e0c19106347d30f16
head: d029b7b803c9fa148a180067a2d28ad6a4c34b04
---

Landed prune ownership for per-run scratch. Prune now reports measured scratch
for selected ended runs and orphaned scratch, then removes only reported entries
when `--delete` is present; live and unselected runs keep their scratch.
