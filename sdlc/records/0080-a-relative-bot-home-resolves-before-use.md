---
base: 4f664da82b6a1fe88630f095d6766030e5ffcfea
head: 40c4be1f78eaf40eb7481086092b5778d5c0d847
---

Relative BOT_HOME values remained cwd-relative after entry, so later reads
could use different homes and scratch keys. BOT_HOME now resolves against the
caller directory at entry, and regression coverage fixes the expected
absolute path.
