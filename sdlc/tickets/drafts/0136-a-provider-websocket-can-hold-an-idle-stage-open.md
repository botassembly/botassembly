---
flow: build
priority: 1
hold: Collect completed-operation evidence and independently identify another stall before shaping a liveness repair.
---
# A provider operation can leave a stage stalled

The workflow runner's ticket 0085 first run, `2026-08-24T13-57-22-3443`, stopped making record progress in code review after its provider turn at 2026-08-24T14:15:59Z. At 2026-08-24T14:27:43Z the Bot process was still alive with no child process or tool work. The process table showed an established provider websocket beside the stalled process. The observation does not prove that the websocket caused the stall. A targeted SIGTERM produced a sealed signal end, the runner requeued the attempt, and the next run completed the same ticket.

This is a Bot runtime finding, not a workflow-runner retry-policy finding. The run was not waiting on a gate, settlement script, or child command, and the runner could only see an active lease until a person compared the record timestamp, process tree, and socket.

Two later runs that appeared briefly similar are controls, not additional occurrences: their records continued through remaining verification gates and both exited normally. Do not count an ordinary silent test or gate interval as this defect.

## What releases this draft

Collect completed-operation durations and independently identify stalled operations from their records and process state. An open websocket beside a quiet process does not prove causation. The explicit CLI process exit already covers handles left open after a completed run. The remaining evidence must distinguish an unfinished provider operation from a completed operation whose transport stayed referenced.

## What needs shaping

- Establish whether a provider-adapter or transport handle remained referenced and why normal stage progression stopped.
- Define a mechanical liveness boundary that distinguishes a long provider turn, gate, or child process from a stage with no record progress and no work beneath Bot.
- Reproduce the stall without assuming which handle caused it. Prove the selected liveness boundary exits or fails with a bounded, visible reason rather than holding its caller indefinitely.
- If the evidence identifies a completed or abandoned provider transport as the cause, make that transport release every event-loop handle it owns, including error and cancellation paths, and prove the non-closing transport case.
- Preserve long legitimate model turns, gate timeouts, child processes, and resumable provider sessions. A wall-clock watchdog without evidence of idleness would be a false fix.

## Evidence boundary

The one proven occurrence justifies keeping the finding in the repository. It does not yet settle whether the root is Bot's adapter lifecycle, the Pi provider package, or the remote websocket implementation, so this remains a draft rather than dispatchable work.

2026-09-08: manual ticket 0052 already added `provider_start`. The remaining prerequisite is evidence from completed operations and independently identified stalls, as recorded in manual 0053. Instrumentation alone does not justify a threshold. The current plan owns that qualification work.

2026-09-09: review confirmed that the existing explicit CLI exit handles transports that remain referenced after a completed run. This draft must not add a second exit mechanism around that solved case. No safe inactivity threshold exists from the single unfinished occurrence.
