---
base: 70c535e4cb87a9e5bab0b98c6f6bfec1e1a01a21
head: 0d9ed109ff8a85d0b89982798ac930fe1ee9f493
---

Landed canonical absolute provenance for local assembly installs, retaining any `#subdir`, so update reads the original source independently of its caller's cwd.

Missing or invalid stored local sources now refuse without replacing the installed copy, and list exposes the stored provenance for operators.
