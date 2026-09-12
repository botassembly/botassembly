---
base: 34a4fec3ad9c0c985023fa65a9c194659dbfb59d
head: f783c4c42af7e8f40f6e696bdd2539012667444c
---

# Decode Pi format-3 and format-4 sessions

Bot now decodes direct format-3 entries and format-4 transaction writes through one private logical stream. Whole transcripts, tool summaries, run logs, and explanations retain every valid entry in order. Public direct-entry helpers keep their prior signatures and behavior.

Independent code review rejected an early pagination change because it could exceed the requested message limit and mislabel a large transaction. Pagination returned to its unchanged format-3 path. Ticket 0251 added the correct cursor in the same integrated batch.

The integrated reader gate passed with 88 repository tests, 1,582 runtime tests, 143 conformance cases, all static checks, and 97.15 percent line coverage under Node 22.22.3.
