---
base: b003b7d3c42f3efc227dfd1c3101c8d8b05c21c7
head: d3cc70ca1856ce28e0f1e219ad7e61da22fde467
---

Flow procedure context now reaches stages inside folder, parallel, choice, and
loop composites. Prompts retain the static root step, identify relevant
structure, and stay silent for an empty flow body.
