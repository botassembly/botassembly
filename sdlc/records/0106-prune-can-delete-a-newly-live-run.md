---
base: 714334d1456e7a0b879a7d87cb97ac716386e5f4
head: 3357f41d88a63c802cf64a0a8f7ee2777c952a0d
---

Prune now claims a selected run's ownership lock through final validation and
removal of both its scratch and run directory. This closes the race where a
newly live run could otherwise lose its sealed work.
