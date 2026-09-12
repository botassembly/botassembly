---
base: b7dc66837ad7bd5be93f7df278f0270cc6f78bb8
head: d9cded9d426cd61d0e17500bf16e9c8a49ffdaa8
---

Durable process-group reservations now keep an abruptly killed run visible
while one of its detached children remains alive. Graceful termination still
sweeps child groups and removes their evidence.
