---
base: 80491d055422a37cdadf4e43aa13729d693546e3
head: ceb0b2fcb21f25728868027110bda75d76613546
---

# The provenance test keeps its hands off the live tree

Landed copied-lockfile provenance hashing through an optional lockfile seam.
The production default remains the package lockfile, while changed fixture
bytes now prove a distinct digest without writing the checkout.
