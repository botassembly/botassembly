---
base: eaa1440b2b2503b8bd8d376f7e6f75274bbceef4
head: 4214f9b7ed4d84e8d399dfb7c40a7aaf6fa1bd7e
---

Agents now have a distinct sequential fault control with a required reason.
A fault ends its stage and run with exit 2 and cause fault, retaining the
reason while skipping checks and retries; refusal behavior remains unchanged.
