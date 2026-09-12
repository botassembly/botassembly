---
base: 21cf85b38a1d4ea1f246f59e91ec0fa8050655bf
head: 9c8abae886cc487d6df001e2c3b0c914789e7465
---

Failure-hook timeouts and execution failures now remain recorded diagnostic
evidence while preserving the failed stage and run ending. The specification
now distinguishes after-the-fact failure hooks from gates and before/success
hooks, which retain terminal force.
