---
base: 155b0e8dd85e2bb93a0f3b2b06e04bf5266467bf
head: bff1ff68bdf07434cc4271c1415199bcb84506c5
---

Declared slots now reject shell-invalid names and uppercase export collisions
at check time. This prevents hooks and gates from receiving unreachable or
silently overwritten slot variables.
