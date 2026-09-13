---
base: 33bf4585921f9e8211a4f6a64ac7e351f9b7fe04
head: 9aef0e933354983a3eb42d6bda954f12f4d90c2d
---

Subflow context previously used a character threshold and then capped only by
line count, so a large single-line output could enter the parent intact.
Context now limits UTF-8 output, including its truncation marker, to 10,000
bytes while preserving the full output path and byte size. The contract and
regression coverage document the byte-boundary behavior, and issue 0060 is
removed.
