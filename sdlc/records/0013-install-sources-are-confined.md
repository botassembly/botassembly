---
base: 6d8d7305ef5ab62902f1f49d808258d93ae26753
head: e4530cd600dc50d5cfcbbdcb6c10f6b9d2dfcb4b
---

Landed source confinement for assembly install and update: resolved `#subdir` paths must remain below their source root, and source-provided `.bot-source` entries are excluded before staging writes fresh provenance.

This keeps untrusted local and cloned sources from escaping the selected tree or redirecting provenance writes outside the installed copy.
