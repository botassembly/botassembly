---
base: b1edab9ecf3de9d1ae9e32a240ec95cf9a83ba91
head: 2c98a89030da5f585a24106d3b67962d18b88131
---

Landed explicit `bot run --continue RUN`: a new run verifies a dead donor's compatible captured assembly, request, flow, sealed-and-judged stage outputs, then copies only its completed execution prefix and begins at the first unfinished work. The donor remains untouched, while the new record names its provenance and each carried stage.

Focused coverage proves sealed-prefix carry, fresh-stage-only execution, self-contained copied outputs, unchanged donor records, and refusals for missing outputs, missing donors, and changed flow shapes. The source ratchet records the continuation implementation's bounded safety and provenance plumbing.
