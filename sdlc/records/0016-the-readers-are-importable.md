---
base: 82cc442a7a334d6b62ecb5a3f71c776644664994
head: 70324d2db04bbd9584e66494f829f68678cd7af7
---

Landed stable package subpaths for the record reader, session readers, one-run readers, and a deliberately read-only inspection facade. This lets related consumers share bot's sanctioned parsers without exposing assembly runtime or prune operations.

An external-consumer test imports every door through package resolution and reads a real run fixture, preserving one parser per format rather than duplicating it downstream.
