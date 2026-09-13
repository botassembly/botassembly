---
base: 34a4fec3ad9c0c985023fa65a9c194659dbfb59d
head: f783c4c42af7e8f40f6e696bdd2539012667444c
---

# Index Pi format-4 sessions

Search now indexes every valid logical entry in a format-4 transaction. Logical siblings keep their shared physical line position. Invalid, non-entry, and unsupported items each contribute to the skipped-entry count without hiding valid siblings.

The private cache schema moved from 2 to 3. Existing schema-2 caches rebuild even when source bytes have not changed. The public search result remains version 1. Search syntax, ranking, cache location, and cleanup ownership remain unchanged.

Independent code review accepted the implementation without findings. The integrated reader gate passed with 88 repository tests, 1,582 runtime tests, 143 conformance cases, all static checks, and 97.15 percent line coverage under Node 22.22.3.
