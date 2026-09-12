---
base: dd9e35d0621f2784b1d456f23a5f3d845bfda459
head: ce47af3a0fe6e97a2f53408d6e3b54a7f7ba7c78
---

# The complete gate checks the specification

The root `make check` now runs the real specification checker before project lint and tests. The hosted runtime workflow already calls that root target, so local and hosted checks share the same gate. The broken home authentication link now targets the specification's local `auth.md` chapter, and the specification changelog records the correction.

Disposable-repository mutations preserve the real root Makefile and specification checker while stubbing only unrelated later rungs. One missing local link and one documented record field absent from `RecordEvent` each fail through `make check` with the expected diagnostic. Independent review accepted the design after correcting its chapter, routing, and mutation detail, then accepted the implementation without findings.

Focused specification tests passed six cases. The complete local gate passed 118 repository and documentation tests, 1,529 runtime tests, and all 143 conformance cases. Hosted runtime run `34707053109` passed on the implementation commit.
