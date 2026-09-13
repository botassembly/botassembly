---
base: 2808cce10cc58d10a1040004cd084f5ce7b20a02
head: 22e2cbf22200398120e404a03930d55a89214b5d
---

Landed `bot run --id-file PATH`, which publishes the run id after record start and before stage work while preserving answer-only stdout.

The option, its run-only boundary, fault behavior, help, and specification are documented and covered.
