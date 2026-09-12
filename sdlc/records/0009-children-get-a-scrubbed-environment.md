---
base: 8e445156849999d456eb6ae6ab7f6daa9e985662
head: f26995ae66b6a30b99d425962729e9aa240b7829
---

Landed a shared provider-credential registry that keeps parent model authentication while scrubbing recognized credentials from agent, gate, hook, and chooser environments.

AWS session and container-authorization credential companions are included so stage children cannot inherit provider secrets.
