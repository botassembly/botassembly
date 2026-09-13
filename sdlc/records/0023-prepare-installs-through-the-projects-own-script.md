---
base: 5f54ad053d5ebd744250b6b91a09a52cb1bbc39b
head: c7ecfa641f53c089c91c1189ea382733ce0f1832
---

Landed project-owned dependency installation: `prepare` now optionally runs `sdlc/scripts/install` in its prepared tree before required gates. This repository's install script runs `make -C bot install`, preserving the prepared `bot/node_modules` outcome while removing bot-specific knowledge from shared prepare mechanics.

Focused lifecycle coverage makes execution order, prepared-tree cwd, absent and non-executable scripts, and failed-install cleanup observable. The lifecycle-script README documents the optional install contract.
