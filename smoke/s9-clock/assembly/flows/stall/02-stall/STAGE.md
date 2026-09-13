---
timeout: 1
---

`$INPUT/note.txt` holds one line.

Do these three things one at a time, each as its own tool call, in this order:
read `$INPUT/note.txt`, read it a second time with the `bash` tool, then write
its line to `$OUTPUT` and nothing else.
