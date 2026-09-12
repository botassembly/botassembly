---
base: 55b101963f4281b2780e8609d98a9845dc6a3620
head: baeeffd982ca403f6f2fb36ed5eaf5f7466af5e9
---

Landed an agent-facing action frame for failed-gate send-backs: repair and commit the cause, rewrite the output, or plainly identify an out-of-scope cause.

The gate output remains verbatim in both the frame and raw record capture, while checklist, schema, and missing-output feedback are unchanged.
