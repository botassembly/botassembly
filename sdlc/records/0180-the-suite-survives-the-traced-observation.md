---
base: 6c743e4ca58606a7f1bd6222996c1943101ecaab
head: 4304a95fa3205f74a36c4b8049e193b10b1c5818
---

# The suite survives the traced observation

The required execve-traced suite exceeded defective test and hook timing
budgets, aborting valid work and causing secondary cleanup failures.

The repair raises only the evidenced suite, hook, process-boundary, and local
deadline budgets. All behavioral assertions and bot code remain unchanged.
The traced and plain suites pass all 971 tests, and lint passes.
