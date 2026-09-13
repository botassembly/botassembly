---
base: 99f8a071d7637dc0495445619cf5d55bfab77962
head: d6125d681754261b44012db9121df8461bb3d03b
---

Prompt provenance now rides a dedicated gating-owned record event after prompt
construction. Successful hooks are recorded first, preserving their evidence
when later preparation fails while historical prompt carriers remain readable.
