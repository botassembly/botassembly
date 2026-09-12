---
base: 0d514d843dc50c5ce707148da0792e65b3748d36
head: 185d315f450eeaa9c158dbf455b40c8d08b75007
---

Home-wide `bot logs` now reads selected runs through the existing bounded pool
while retaining input order for rows and diagnostics. This removes serial I/O
without changing the command's output contract.
