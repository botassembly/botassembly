---
timeout: 300
---

Read the customer request in $INPUT. Read the rubric at
$SKILLS/priority-rubric/SKILL.md. Write to $OUTPUT a JSON object with keys
`priority` ("urgent" or "routine"), `trigger` (the exact phrase from the
request that decided it), and `request` (the request text).

## Checklist

- The priority follows the rubric at $SKILLS/priority-rubric/SKILL.md
- The trigger phrase appears verbatim in the request
