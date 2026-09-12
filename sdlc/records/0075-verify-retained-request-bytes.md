---
base: 90dfc8fb84b53277d7152133a2abe05c3960e6ec
head: d523c7178ac363b25437712a7d362964e6dc7518
---

`bot request` previously printed a retained request even when its bytes no
longer matched the SHA-256 recorded for the run. It now checks that hash before
writing output and refuses mismatches using the established record-mismatch
error. Regression coverage protects the behavior, and the request help now
describes the verification.
