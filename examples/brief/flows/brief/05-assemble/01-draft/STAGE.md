---
retries: 2
---

$INPUT holds `title.txt`, `tags.txt`, and `bullets.txt` from the three branches,
and `draft.txt` from the previous repeat once there has been one.

Write to $OUTPUT a digest with exactly these three sections, in this order:

```
## Title
<the line from title.txt>

## Notes
<every bullet from bullets.txt>

## Tags
<the tags from tags.txt, comma separated on one line>
```
