---
base: 5c6d29b61e585e020de0c6fb89ba4b5e474fd25d
head: ac891afa51ad6d1b76663e14e6a9fad4babcd38c
---

The runtime now removes each stage-scoped temporary slot at stage settlement
and each flow-shared slot at flow settlement, including refusal and handled
signal paths. It retains inputs, outputs, sessions, skills, and recorded
material while preventing temporary toolchain files from accumulating.
