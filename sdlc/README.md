# How this sdlc folder works

The [current plan](planning/plan.md) owns priorities and open questions. Tickets describe individual changes; records describe what landed. A matching record marks a ticket complete. `tickets/drafts/` holds unpromoted work. `tickets/archive/` holds completed or withdrawn tickets; consult the record to distinguish them.

`issues/` holds findings awaiting triage. New issues use dated slugs and do not consume ticket numbers. A promoted ticket cites its issue and preserves the evidence before the issue is removed.

`records/` holds one sealed note per landed ticket — the `base` and `head` commit SHAs and a paragraph of what landed. Records are append-only history; nothing edits a record after it is written.

`planning/` is where the repo thinks before it decides. The live parts are `planning/adr/` (accepted decisions, cited from the specification changelog), `planning/decisions/`, `planning/notes/` (including the ratchet ledger and any current dated handoff), and the standing rulings at the planning root (`driver-protocol.md`, `punchlist.md`, `open-questions.md`, `vocabulary.md`, and kin). Everything the repo thought and then finished thinking — prototypes, the pre-sdlc ticket history, the old smoke fixtures, dated review snapshots — was removed in the 2026-08 planning cleanup and lives in git history.

A session handoff lives at `sdlc/planning/notes/handoff-YYYY-MM-DD.md`. It carries transient state that the repo's own tooling does not already show: verified state, decisions not yet filed as ADRs or tickets, next steps in order, and warnings. A worker must read the handoff, act on it, and delete it once absorbed — a stale handoff is a lie. Durable content moves to a ticket, an ADR, or a plan before deletion.

`project/` and `scripts/` support the project lifecycle: `project/` carries five lifecycle scripts (`tasks`, `before`, `success`, `failure`, `health`) copied verbatim from the canonical set, and `scripts/` is this repo's own gate ladder. `ratchet.json` belongs to that machinery. Exit codes are the whole contract.
