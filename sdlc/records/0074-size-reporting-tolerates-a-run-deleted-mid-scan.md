---
base: 419305af1d0c55a488353ba8e4c49c7a0591b584
head: 4fbb855e04c92bde11d931809b19724d81eefb78
---

Made size reporting tolerate entries deleted after a directory listing. The
walk now treats only ENOENT races as zero bytes, preserves other errors, and
keeps prune's absent-scratch result. Added deterministic regression coverage
for vanished files and directories.
