# ThinkThen tracks audit and diff for graded runs

Status: Open. Tracked in ThinkThen.

Grading botassembly runs with `thinkthen audit` and `thinkthen diff` would need four things beyond ThinkThen 0.1: graded scores, cost and latency per row, repeated samples per case, and run identity. ThinkThen tracks all four in its own repository at `sdlc/issues/2026-09-24-audit-and-diff-needs-for-graded-agent-runs.md`. That page says what ThinkThen rows already provide for each need and how its 0.1 audit and diff stay open to adding them.

0.1's audit and diff match the prototype measurement script and its goldens. Nothing here waits on botassembly. Ask ThinkThen for a ticket when botassembly needs one of the four.
