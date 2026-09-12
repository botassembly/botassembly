---
base: 41a65c4dad57cb59289f6d269b8b1d07967338f2
head: 1906d29df0412c883bdf5a50c9e33ac7cc74bdc2
---

Home-wide `bot logs` now reports each run whose record cannot be read while
leaving stdout limited to tool rows. This prevents a filtered empty result
from hiding an unreadable run.
