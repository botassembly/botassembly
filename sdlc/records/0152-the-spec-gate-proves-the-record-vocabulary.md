---
base: e0c88e43fa291fd660601537fa97590a7b0dd601
head: f8dd442a7a8dedce17186759f5c67693afebf15e
---

The spec gate now derives record event names and top-level fields from the
TypeScript contract on every pass and compares them with the specification.
The record specification now inventories that vocabulary and documents prompt
provenance so code-only contract drift can no longer land silently.
