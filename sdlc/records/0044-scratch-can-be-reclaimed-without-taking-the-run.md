---
base: e1ce242477bdc83c582bdab2209a4a569b06c966
head: 8214a72a40572e13e40b5349fd175b7332f9a6bc
---

Landed `bot prune --scratch` so operators can reclaim selected ended-run and
orphan scratch without deleting run directories or locks. The flagless prune
report remains unchanged.
