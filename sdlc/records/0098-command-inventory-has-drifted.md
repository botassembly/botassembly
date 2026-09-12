---
base: 58426f7db637eafdf3fc2c7fdb0f1ef08e242133
head: fd4b3944dfb49a826b0fd6d26d03a9357e6e9286
---

The CLI now derives its command inventory from the dispatcher and uses it in
unknown-command guidance. Help and usage coverage follows that inventory, so
`request` and every dispatched command remain visible on every command list.
