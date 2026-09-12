---
base: be971bc01f0c58b8bebd3b50daaf6ea347243034
head: bfa464f1fd654b513ec2aeedf86d425dd55aa7b1
---

`bot/package-lock.json` pinned the indirect development dependency
`nanoid` at 3.3.16, which npm audit reported under the high-severity
GHSA-2v37-7h3g-55p8 advisory. The lockfile now pins the smallest fixed patch,
3.3.18, without changing direct dependencies or tests.

`npm audit --package-lock-only`, `sh sdlc/scripts/lint`, and
`sh sdlc/scripts/test` pass on the updated lockfile.
