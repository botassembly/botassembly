---
base: e3094e8c2fdbbbeb16f23f5b180e648f681a2ed1
head: ed23c16d170ee634975b158c7cb801cf8c548331
---

# A failed append ends the run loudly

Record writes now publish their first I/O failure, stop active flow work, and
reject later writes without leaking unhandled rejections. Post-seal appends
also reject, while successful records retain their event order and bytes.
