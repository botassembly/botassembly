---
flow: build
priority: 1
hold: Accept a narrower guarantee set and identify a concrete storage simplification worth its cost before implementation.
---
# Contract installation storage after its guarantees are named

Manual ticket 0057 completed first-use identity creation. Its source draft also proposed installation storage contraction. Design review split that work out. The home specification now names detailed ownership, mode, path, link, race, publication, cleanup, synchronization, and recovery guarantees. Their existence does not justify removing them. This draft remains held until the project accepts a narrower guarantee set and names a concrete simplification worth the lost protection.

Done, observably:

- Installation storage keeps every state required by the guarantees named in the specification.
- The runtime, readers, records, and updates preserve those guarantees after the contraction.
- The storage change has focused proofs and a complete offline check.

Boundary: storage contraction only. Do not manufacture a rewrite target from line count. Do not remove a protection, alter the identity shape, change run records, or change installation behavior until the release condition in the hold is met.
