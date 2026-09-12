---
base: 6acd29693683250e8252e42201062c80459066bd
head: a209b89e056cecc46f691d6fb5eb3f47a3387da7
---

# The pressure-test fixes land as one change

Landed the five ruled pressure-test guarantees as one coherent change. This
removes migration exceptions, preserves explicit input meaning, and makes
wind-down ordering and diagnostics reliable.
