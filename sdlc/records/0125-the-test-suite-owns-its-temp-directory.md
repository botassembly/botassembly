---
base: c2fca3e1f7ca8dc305a18405cedc60e2573ea50a
head: 2b9aef11b2201cb7a3bee200aea53ce77389aa00
---

Vitest now owns a checkout-local temporary root, restores inherited temporary
variables, and removes the root after each suite. Tests create unique children,
compare resolved paths, and lint rejects host temporary-directory paths.
