---
base: 589d722f756e93f852493277d584c9005a4429ee
head: 76c399a30bfd12c9eea6e24ab157de307f44bfa6
---

# The warning turn no longer re-runs the ladder

The temp-directory warning now precedes the gate ladder in `work()`. The ladder runs once on the tree the warning response leaves behind, and a re-run happens only through the rejection send-back path. The interim snapshot machinery from `3b06945` is deleted. Landed by hand during the 2026-09-01 witness repair, authorized by Ian, factory paused.
