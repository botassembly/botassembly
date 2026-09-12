---
base: b9c448d640dfccc8693326ddabb10f8f465aa256
head: adbfdba7e11ca236c342af2c080e4927171ef8e7
---

Gate-folder entries whose stems are `before`, `success`, or `failure` now
refuse at check time. This prevents one file from becoming both a gate and a
hook, and tells authors to place hooks in the stage folder.
