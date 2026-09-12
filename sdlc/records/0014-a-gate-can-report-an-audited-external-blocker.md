---
base: e97aa71b6c97290a28964ce3b96945251d16dfb8
head: 6d0f8ebbda9cf3dfdda060e50cc3505da2827ec3
---

Landed the audited external-blocker gate verdict: an executable gate that exits `75` with nonempty captured output ends the stage and run at exit `1` with cause `blocked`, retaining its exact evidence without consuming retries.

Silent `75`s, ordinary red gates, hooks, and model prose remain unable to mint the verdict; the published cause vocabulary and runtime record now state that boundary.
