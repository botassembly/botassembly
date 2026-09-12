---
timeout: 900
---

$INPUT holds the section plan. Turn it into the outline body.

For every level-three heading under `## Sections`, call the `expand` subflow
once, handing it that heading, the sentence beneath it, and level three. Submit
them as one batch so they run together.

Write to $OUTPUT the title from the plan's frontmatter as a level-two heading,
then every section the calls returned, in the order the plan listed them.
Change nothing inside a returned section. Add nothing of your own.
