---
base: 3f1b799e190c3dcb9b7001d49aee7bacd9484b4a
head: 627524c8d96c474e8c4bd566786eb526f0e57ee4
---

Landed provider session identities that include the writer run directory, so
same-named child subflows in concurrent runs cannot share a provider session.
A missing `BOT_RUN_ID` now faults instead of silently using a colliding key.

Live runner coverage drives two concurrent parent runs and child subflows,
proving distinct child identities and retry stability within each child.
