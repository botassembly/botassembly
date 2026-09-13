---
base: 790e84b14e08f84808f1bf7dc100f93cc68d20ec
head: 95153d6a53bccacfa7efa287cc1f686a36072fe1
---

Landed the neutral gate-retry frame across the runtime, specification, and live retry-session coverage. It no longer assumes repository commits or tickets.

The running guide now warns that omitting `--in` deliberately uses the caller's current directory, so authors select an intended worktree when needed.
