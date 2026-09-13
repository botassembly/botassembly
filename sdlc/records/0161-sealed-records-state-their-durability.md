---
base: 27af7ff501372897615906a9a2f4181981317d09
head: 3803cba599556e4d32d63fbb1add63fc563675bc
---

Sealing now syncs the terminal record append so completed records survive power
loss. The record contract documents this guarantee and the weaker durability of
unsealed tails, with tests covering the sync and its failure path.
