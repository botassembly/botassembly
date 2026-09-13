---
base: 6616c3e4663d3f2d69c7dc5828fbe0a876f3a404
head: c482bed096a19087fcbe17dbd30f6e0d995def81
---

Handled signals now retain the interrupted stage in the run ending. Records and
`bot show` expose completed work, interrupted work, and the observed signal so
downstream post-mortems can explain where a run died.
