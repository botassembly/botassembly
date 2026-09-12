---
flow: build
priority: 20
---
# Bot can inspect a subflow child by its recorded reference

Deck 0037 reached final verification with a run page that retained `subflow_call` facts, then reproduced a missing Bot boundary. A real child value in the parent record is a parent-relative path such as `stages/<stage>/<attempt>/<retry>/subflows/<call>`, not a top-level run name. `bot show` accepts only top-level run names, so Deck cannot use the recorded reference to determine whether the child is readable or link to it. Reading Bot's run directory directly from Deck would cross the runtime's storage boundary.

This ticket adds the Bot-owned inspection capability Deck 0037 consumes. Deck 0037 remains blocked until this behavior is landed and deployed.

## What done looks like, observably

- Given a top-level parent run and the exact child reference recorded in its `subflow_call` event, Bot can inspect that child through its public read interface.
- A readable child returns the same sealed run facts the ordinary top-level inspection path exposes. Deck does not need a second parser or knowledge of Bot's directory layout.
- A missing or pruned child is reported as unavailable, not as a malformed parent and not as fabricated data.
- Absolute paths, traversal, links escaping the parent run, unrecorded sibling paths, malformed references, and references to non-child files are refused before any content is read.
- Existing top-level `show`, `runs`, `logs`, `output`, and prune behavior remains unchanged.
- Tests use a real parent record and nested child record, then cover readable, missing, pruned, malformed, and containment-refusal cases through the CLI boundary Deck will call.

## Hard choices settled here

The parent run and its recorded child reference form the authority. A bare nested filesystem path is not a new public identifier, and consumers never reconstruct `$BOT_HOME/runs` paths themselves.

Reuse Bot's existing held-run reader and sealed projections rather than adding a second child-record parser. The exact command spelling is the design's choice; the observable contract is that a consumer can follow the opaque child reference Bot already records.

## Consumer and adoption

Deck 0037 is the first consumer. After this ticket lands and the registered Botassembly checkout is at that commit, Deck 0037 may be amended to use the public child inspection boundary and re-readied. No Deck code lands in this ticket.

## Boundary

- No new run-record field or change to the stored child reference.
- No recursive inline rendering, run graph, search index, or storage migration.
- No Deck route, rendering, or filesystem-reading change.
