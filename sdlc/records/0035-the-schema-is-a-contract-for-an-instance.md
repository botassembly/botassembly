---
base: 778b0eed21f5e7132c86ab15726c49336ac726c2
head: 2d17e17e6364c732d2d4a31fbfca021e7f324706
---

# The schema is a contract for an instance

Landed JSON-schema prompt rendering that omits document metadata and explicitly
asks for an instance rather than schema keywords. Constraints and literal
property names remain visible; legacy `definitions` entries receive the same
metadata removal.
