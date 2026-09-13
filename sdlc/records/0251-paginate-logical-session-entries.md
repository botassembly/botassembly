---
base: 34a4fec3ad9c0c985023fa65a9c194659dbfb59d
head: f783c4c42af7e8f40f6e696bdd2539012667444c
---

# Paginate logical session entries without loss

Session cursors now carry a physical offset and a logical ordinal. A page can stop inside one format-4 transaction and continue without repeating or omitting a message. Version-1 cursors remain readable with ordinal zero. Existing snapshot, source, line, message, and rendered-page bounds remain in force.

Independent code review rejected an internal renderer that leaked through the public session module and tests that did not prove the combined exact sequence. The accepted implementation keeps rendering private and checks the exact ordered messages across every count-limited and byte-limited page.

The integrated reader gate passed with 88 repository tests, 1,582 runtime tests, 143 conformance cases, all static checks, and 97.15 percent line coverage under Node 22.22.3.
