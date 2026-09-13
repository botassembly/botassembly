---
base: b0a1072571706325594b6c436f9a3b5a4f25199f
head: de44ebbf64ed6ce92fe0eb417b0df53c9a6c3699
---

# Unavailable subflows stop before file input

Bot now refuses a subflow outside the caller's resolved scope before expanding, reading, hashing, or retaining its requested file. The numbered parent event records the bounded scope refusal without input, child, exit, cause, or output facts. It creates neither the per-call answer path nor the nested child record path. Already-present inline text keeps its historical descriptor without creating child files.

Valid subflows retain ordinary slot-expanded and absolute file inputs under the operator's authority. Stopped valid calls retain their separate post-input ordering. Batch siblings continue independently with stable call numbers.

The implementation moved one existing lookup branch and added no production abstraction. Production TypeScript remains 17,962 nonblank lines. The specification now distinguishes admitted inputs, unstarted dispositions, and started child records. Older unstarted record events with file descriptors remain readable. Pi did not change.

Independent design review rejected the first draft because absent copies did not prove absence of a read, stopped-call ordering lacked a guard, the record chapter overstated its input promise, unavailable inline evidence needed an explicit compatibility ruling, and the complexity rationale was inconsistent. The repaired design added a selected-path read witness with a valid-flow control, exact artifact assertions, a stopped valid-flow case, both specification chapters, inline compatibility, and corrected scoring. Both formal and supplemental reviewers accepted it.

The build began with two failing regression cases against the old order; the readable unavailable path was observed once. The completed focused set passed six new cases and 60 neighboring cases. An independent extra-high code reviewer passed 86 tests across 14 files and accepted the code. Its one low-priority stale specification sentence was corrected before the complete gate.

The final local gate passed 139 repository and documentation tests, 1,586 runtime tests across 204 files, all 143 conformance cases, static checks, the repository scanner, and the production-size check. Hosted documentation run `34773562475` and hosted runtime run `34773562445` passed on the exact implementation commit.
