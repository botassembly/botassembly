---
base: 3d59ec3e394a147e572a3d8f1ebaa5b492472d96
head: b4a5ac158d36c9c7514ed2a302ae99fbdd61c99c
---

Interrupted installs staged under an anonymous hidden directory, which made
`bot status` omit the stranded copy. Install staging now includes its target
name, allowing status to report its bytes and nested assembly name as an
uninstalled install. Regression coverage covers standalone and nested staging;
automatic cleanup remains out of scope.
