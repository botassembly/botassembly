---
base: 7aaf457c632f499110947e725c90f4d6b1a0fd64
head: 7087086bc8cf6ed45ab09edeeb16f67e4ba877b1
---

Descendant-flow prompt coverage now verifies that a child stage receives its
own procedure and static position at the CLI/provider boundary. An empty child
body emits no procedure and never inherits its parent's body.
