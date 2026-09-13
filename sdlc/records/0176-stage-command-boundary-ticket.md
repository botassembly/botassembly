---
base: 9396081c6b5db16ede093d518a774107a1166edf
head: 6c5c1a9df23f3d8bff324e2fed3429689e33c4b7
---
# Stage command boundary

Stages may now declare model-facing file-slot and command access. Bot rejects
calls outside that policy before results enter context while preserving hook
access and unrestricted compatibility for stages without a declaration.

Sealed records and `bot explain` retain bounded denial evidence so incomplete
and exhausted runs remain understandable without exposing denied content.
