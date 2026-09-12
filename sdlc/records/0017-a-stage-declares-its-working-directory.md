---
base: 6d39c346b15bae895fcdfec8de15b9a15d7ca129
head: 6fd1b89c669c8cc6deaa348fe142b025e978b33a
---

Landed stage-only explicit relative workdirs rooted at `--in`, with lexical and preflight refusal before provider work. Stages now use their selected caller-owned directory for the agent, local context and skills, hooks, gates, check rendering, and inherited subflows; documentation and conformance fixtures define the boundary.
