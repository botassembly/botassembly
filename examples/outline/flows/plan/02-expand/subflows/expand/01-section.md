---
timeout: 300
---

$INPUT holds one section: a heading, the level to write it at, and the material
that belongs under it. A section divides when its material falls into two or
more subsections that each deserve a heading.

- **It does not divide.** Write the heading, then its bullets, and stop.
- **It divides.** Call `expand` once per subsection as one batch, handing each
  that subsection's heading, its material, and a level one deeper than yours.
  Write your own heading, then the returned sections, unchanged and in order.

If `expand` is not among your tools, write the heading and its bullets and stop.

Write to $OUTPUT in the style at $SKILLS/outline-style/SKILL.md.
