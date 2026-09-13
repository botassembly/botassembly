---
base: fc9126d7d09df04f35401644727be750d78ab94e
head: 2243277c13a7819fc590b2a99fb72f476d89d27b
---

# Give prune process tests the process-boundary budget

The large-fixture prune tests used Vitest's generic five-second timeout for
real CLI work, so parallel suite load could exhaust their budget. All nine
tests now use the existing 30-second process-boundary budget while preserving
the finite child-process guard and production behavior.
