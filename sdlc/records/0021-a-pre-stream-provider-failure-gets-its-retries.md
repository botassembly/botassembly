---
base: 5662e0fc07428d75635ce740614a061aa3b52f98
head: 9f2275da02e003248c7efae1ba0d5c963b913add
---

Landed one bot-owned retry for a classified transient provider failure before any tool starts, bounded by the prompt deadline and recorded with its attempt and delay. This recovers the observed in-band failure safely without replaying tool work or retrying quota failures.

The record specification and `bot show` witness make the retry observable to operators.
