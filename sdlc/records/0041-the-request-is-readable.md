---
base: 222a53b4b5f83e68090678c15edb202d926eaad5
head: 89a63ca8633d8e2adf5b0868ed2ec26a98f173cc
---

Landed `bot request <run>` for byte-exact retrieval of a run's retained
request. It follows established run resolution and refusal behavior while
rejecting missing, unreadable, and non-regular request files.
