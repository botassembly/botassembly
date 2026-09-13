---
base: fd2d3907f7788579fe632ffff6844b35c13a578c
head: ada68df98aae05a64cd7194052a422f152439ca0
---

# Explain interrupted runs

`bot explain` now preserves completed stage facts while reporting interrupted
attempts and their available turn and transcript evidence. Missing or unreadable
transcripts remain local to their stage, and stage narrowing covers both states.
