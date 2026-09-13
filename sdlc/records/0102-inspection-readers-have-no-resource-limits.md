---
base: 956cb5ed80fe0ce08d1f8a87c163704fe1da64b4
head: 509aaf6a8d39a4b4e9e6d8956db8d68cefe1632e
---

Inspection readers now cap record and session bytes and lines before parsing.
Status uses bounded iterative walks and refuses incomplete home readings.
This keeps hostile inspection input from exhausting resources.
