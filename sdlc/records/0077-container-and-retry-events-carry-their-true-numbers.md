---
base: 3e5ee4c98ba7591c39ea1225d429907d004a74d3
head: 3c89d9a62cc9fc1e20835a6bb549c6d63fcb60aa
---

Provider retry reporting now retains the live stage identity, so retries after
a send-back record their actual stage attempt while retaining their local
provider attempt. The established looped-PARALLEL record behavior was exercised
and continues to identify each fan-out by repeat.
