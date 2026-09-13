---
base: 2639a4be3a38d7ad5c04cba98909e48cc63dc4ed
head: f42e011047f73e8a716c2b52067ee55551076232
---

Landed bot-owned Codex provider wrapping with an explicit WebSocket request and record events that distinguish that request from pi's published SSE-fallback diagnostic. `bot show` renders the observed transport facts, including whether events were emitted.

The record specification and focused tap coverage preserve the distinction so the fallback is reported as adapter evidence, never inferred as a used requested transport.
