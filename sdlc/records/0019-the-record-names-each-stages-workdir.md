---
base: 6d146ce1f26f6ea3de83ea5c4e3f7bb6ba1a91db
head: 33510b538219684c756c264608b5fe638cd1c3e2
---

Landed portable `stage_start` workdir metadata and `bot show` rendering.
Records now preserve authored and root-relative stage locations without
machine-specific absolute paths, while older records read as inherited root.
