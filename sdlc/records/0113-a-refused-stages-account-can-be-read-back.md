---
base: 63492df7b53fa316f52ad5f34fca04d333529408
head: b10487dd4655258e101197f65c7e329368ed1c8b
---

Added `bot draft RUN STAGE` to read a refused stage's retained unjudged draft
byte-for-byte, with a stderr warning. Kept `bot output` sealed-only so its
judged-record promise remains intact.
