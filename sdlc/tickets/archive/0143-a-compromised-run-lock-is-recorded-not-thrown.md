---
flow: build
priority: 7
---
# A compromised run lock is recorded, not thrown

Run locks are held with a ten-second staleness window refreshed from the holder's event loop. When the holder stalls past the window — entirely possible under parallel full suites on a loaded box — the lock library declares the lock compromised, and every caller that takes a run lock today leaves the default compromise handler in place: an uncaught asynchronous throw, landing wherever the event loop happens to be. Nothing about the compromise reaches the run record or any log, which is why the prune-summary preflight flake (issue filed 2026-08-26) has a suspected mechanism but no direct evidence: the one event that would name it is currently thrown away as a stray crash.

Done, observably: when a held run lock is compromised, the holder records a diagnostic naming the lock, the run, and the stall duration, ends the interrupted operation cleanly instead of crashing an unrelated caller, and a reader can find the diagnostic afterward. A test pins the compromise path by forcing the stall.
