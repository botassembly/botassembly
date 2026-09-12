---
base: 48606a10779dc07ba472b769a7583dc2613572d7
head: 047054c6e8c66037dcf511a598581f8cbc2cb94b
---

# A running gate is visible before it finishes

Gate execution now records its stage identity, file, and pinned hash before the
child process starts. Human-readable records distinguish that start from the
completed check, so operators can see a running or interrupted gate without
mistaking the start for a verdict.
