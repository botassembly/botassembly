# A provider-stage stall remains unexplained

One workflow run on 2026-08-24 stopped making record progress after a provider turn. The Bot process remained alive with no child process or tool work. An established provider websocket appeared beside the process. That observation does not prove the websocket caused the stall. SIGTERM produced an honest sealed signal ending, and a later run completed the same work.

Later quiet runs completed normally and serve as controls. The existing explicit CLI exit also handles transports that remain referenced after completed work. A wall-clock watchdog based on this single occurrence could kill legitimate long model turns or gates.

This issue does not block `0.1.0`. Promote it only after either:

- another independently observed stall plus relevant completed-operation timing evidence distinguishes idle failure from legitimate work; or
- a deterministic reproduction establishes the cause and proves a bounded repair.

A repair must preserve long provider turns, gate timeouts, child processes, cancellation, and resumable sessions. It must leave a visible bounded reason instead of holding the caller indefinitely.
