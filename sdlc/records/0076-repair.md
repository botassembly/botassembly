---
base: 72e500f1cd588d822399b5af4f852e4b0b5eec47
head: 6fe315c203a3583da6e9a26e8c163f27ef535e47
---

Model preflight skipped DESCEND self-calls and conflated root and child option
scopes, allowing a command-only model to fail only during recursive execution.
It now queues DESCEND self-flows with child invocation options and tracks each
flow by its read scope. Regression tests cover upfront refusal and a resolvable
DESCEND run; the source ratchet accounts for the necessary production lines.
