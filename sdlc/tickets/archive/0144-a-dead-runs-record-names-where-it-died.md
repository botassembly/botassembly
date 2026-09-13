---
flow: build
priority: 6
---
# A dead run's record names where it died

When a run is killed by a signal, its sealed record says only that it left. The post-mortem of the 2026-08-24 terminal-child kill — the incident behind factory's scheduler-fence ticket — reads, in its entirety: died by signal, stage none, failure none. Which stage was in flight, what the run had completed, and which signal arrived all had to be reconstructed by a human from timestamps and the process table.

Done, observably: an interrupted run's record retains the last completed stage, the stage in flight when the run ended, and the signal when it is observable; `bot show` renders them; and the factory's attempt-died event carries them through so `factory why` answers "it died during code review after design completed" instead of "it died". The open recording tickets (0130 through 0132) cover what a live stage was given; this one covers what a dead run was doing.
