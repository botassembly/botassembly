---
base: 5c71e92b38425eb2f3d1a7bcfcfddf08e362210a
head: 92e5ee262c3d65092868cee8eab3125f23da239a
---

# Make the temporary-storage proof await its sample

The temporary-storage ceiling proof now observes and awaits the production
sampler's exact promise before restoring its unreadable fixture. This removes
the false synchronization barrier while preserving live sampling and byte
accounting behavior.
