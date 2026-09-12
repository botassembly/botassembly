---
flow: build
priority: 3
---
# A run's children die with the run

Bot sweeps its detached agent and gate child process groups when a
run ends, and ticket 0068 extends that to compromised-lock endings.
But when the bot process itself dies without ending — kill -9, the
OOM killer, power loss mid-run — nothing sweeps those groups. The
run's heartbeat goes stale within ten seconds, so run-level
liveness (and the busy probe ticket 0085 builds on it) truthfully
reports the run dead while an orphaned agent or gate child may
still be writing into the working directory. Cleanup that trusts
the probe can then remove a tree under a live writer. Every
liveness mechanism considered in the 2026-08-19 first-principles
discussion shares this blind spot; it is orthogonal to 0085's
redesign, not a defect in it.

The behavior: a run's descendants do not outlive the run's
ungraceful death, or cannot outlive it invisibly. The repair
direction is process-group containment a janitor can see — the
run's children in a group whose liveness can be checked, and
swept, independently of the bot process. Whether the containment
kills on parent death or lets the liveness answer cover the
orphans is design's to settle; either way the invariant is that a
directory never reads idle while a process the run started is
still writing into it.

Done, observably: kill the bot process ungracefully mid-stage
with an agent child running; within the heartbeat staleness
window, either no descendant of the run is still alive, or the
run's directory still reads busy until the last descendant is
gone. A graceful run end keeps today's sweep behavior unchanged.

This ticket was issue
`sdlc/issues/0086-a-run-killed-ungracefully-can-leave-children-writing-in-an-idle-directory.md`,
promoted 2026-08-19; the number carries.

Named for restatement in `design:`/`design-review:` commits: none
expected — the swept-process-tree cases that ticket 0068 lands may
grow ungraceful-death siblings beside them.
