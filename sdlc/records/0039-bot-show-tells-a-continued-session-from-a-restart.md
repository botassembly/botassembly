---
base: d88f510bcf468eb346dea4cf9df6a8815c47a14f
head: 474878f389b4c9f812a7e32a950371cd85c0cae2
---

Landed human `bot show` session labels from recorded session paths. First
occurrences say `new session`; repeated paths say `continued session`, so a
gate retry no longer reads as a restart. JSON output remains the record's own
unchanged lines.
