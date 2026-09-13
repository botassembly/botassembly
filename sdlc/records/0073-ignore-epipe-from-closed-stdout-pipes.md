---
base: 0dbb0c9eed55c93a4e7e340e91dfc47152a2f341
head: 2859e39b71ab57cf103d11087fcfdb94fe8228b9
---

Closed stdout pipes crashed the CLI with an unhandled EPIPE and exit 1.
The process boundary now ignores only EPIPE stdout errors while rethrowing all
other stdout errors.
