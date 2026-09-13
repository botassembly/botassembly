---
base: 4e01adc66354c9f2a049340b62d2c35626c8dda3
head: 2745244353e03c8b71914a81ab62b0def155daf1
---

# Initializer rereads one settled installation record

Concurrent initialization now handles the winning record's brief two-links-to-one settlement without accepting bytes from a changing read. The initializer closes and discards that read, then performs exactly one fresh strict read. A second instability still fails. Ordinary installation reads remain fail-fast.

Hosted runtime run `34711681836` exposed one child exit with `record-changed`. A deterministic direct-process schedule reproduced the cause: one initializer opened the published inode while the winner's temporary hard link remained, then the winner removed that name. The inode contents stayed intact while link count and ctime changed. The red proof produced winner status 0 and loser exit and close status 1 with safe fields `record-changed`, exit 5, and `published: false`.

The process proof now owns its failure bounds. It limits readiness, settlement, cleanup, and retained output; hashes all drained output; removes credential environment names from children; awaits both process statuses and both output streams; and reports only bounded allowlisted facts. Thirty-eight focused harness cases cover launch, IPC, deadline, cleanup, stream, status, overflow, parsing, and late-event failures. Independent code review rejected five harness faults before accepting the remediated boundary.

Independent design review accepted the production boundary after three rounds and required explicit test-harness limits. Independent code review accepted the implementation after two rounds. The focused installation set passed 77 tests, the direct-process security proof passed 20 consecutive repetitions outside the process sandbox, and the complete local gate passed under a minimal environment. Hosted runtime run `34717268615` passed on the exact implementation commit. Production size moved from 18,344 to 18,379 nonblank lines.
