---
base: 05f08b9423d0d7d49fa61961a2b3d507f856afa9
head: 9def9fdaeb3a620e195bafaa531711a1bbcb3c1c
---

Landed `bot run` support for the conventional `--` end-of-options marker, so post-marker assembly/flow and request words remain positional even when dash-prefixed.

The invocation specification and run help document the grammar, while behavioral coverage confirms pre-marker options still apply and other invocation readers are unchanged.
