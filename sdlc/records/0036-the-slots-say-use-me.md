---
base: f621de7a72aac2ce7e1b5ed4e58693203f7e0309
head: 25a4d857a7875c16e30cfbb62e9a61e52d4ab5d2
---

# The slots say use me

Landed prompt guidance requiring slot names rather than resolved paths for file
access. The `$TMP` slot now directs working files to task scratch and nowhere
else, while preserving existing slot order and conditional entries.
