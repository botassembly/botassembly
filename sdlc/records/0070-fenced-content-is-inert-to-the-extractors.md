---
base: baeccbdc56465ab368b2794362a3044ce299a274
head: 22dcec18c76dee910ff3ce2701bdfb56906a9af4
---

Fenced code blocks could terminate checklist extraction or supply phantom
CHOOSE alternatives. Both extractors now ignore fenced lines, with regression
coverage for the checklist and alternatives cases. The source ratchet reflects
the shared fence filter, and the resolved issue is removed.
