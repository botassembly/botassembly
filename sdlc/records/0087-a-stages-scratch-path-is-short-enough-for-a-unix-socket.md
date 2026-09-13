---
base: 6ec04c842658394547f27dd91de22dc3609a224b
head: fe7e55aaac45015a7a4570ce8c480efb15467645
---

Stages receive deterministic short `/tmp` handles for `$TMP` and `TMPDIR`, so ordinary Unix sockets fit without moving retained scratch from the run cache.

The handles remain private, are removed with stage or flow scratch, and prune reclaims handles for removed scratch.
