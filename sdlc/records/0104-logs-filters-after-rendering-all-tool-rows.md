---
base: 26d3baa9951256a3b49c1d5d03bf092558f60b60
head: b660a010c147ad2e0475152d4267451b5610c9f9
---

`bot logs` now filters settled tool calls by their structured names and failure
state before rendering. Exact filters remain correct for names containing row
separators while the rendered output and missing-session behavior are retained.
